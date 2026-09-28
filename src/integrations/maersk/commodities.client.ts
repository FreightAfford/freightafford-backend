import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
import { createTtlCache } from "./cache.js";

// Maersk Commodity Classifications API.
// Auth is the Consumer-Key header only (no OAuth for this product).
// `commodityName` is a case-insensitive substring match on the whole phrase,
// and `limit` is ignored, so ranking and trimming happen here.

interface MaerskCommodity {
  commodityCode: string;
  commodityName: string;
  hsCommodities?: { hsCommodityCode: string; hsCommodityName: string }[];
  cargoTypes?: string[];
  hasUSFlag?: boolean;
}

export interface Commodity {
  code: string;
  name: string;
  hsCodes: string[];
  cargoTypes: string[];
}

export const COMMODITY_CODE_REGEX = /^\d{6}$/;

const SEARCH_TTL = 24 * 60 * 60 * 1000;
const LOOKUP_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_RESULTS = 15;

const UNAVAILABLE_MESSAGE =
  "Commodity search is temporarily unavailable. Please try again shortly.";

const maerskCommodities = axios.create({
  baseURL: envConfig.MAERSK_COMMODITIES_URL,
  timeout: 10_000,
  headers: {
    "Consumer-Key": envConfig.MAERSK_API_KEY,
    Accept: "application/json",
  },
});

const { get: getCached, set: setCached } = createTtlCache(MAX_CACHE_ENTRIES);

const toCommodity = (c: MaerskCommodity): Commodity => ({
  code: c.commodityCode,
  name: c.commodityName.replace(/\s+/g, " ").trim(),
  hsCodes: (c.hsCommodities ?? []).map((hs) => hs.hsCommodityCode),
  cargoTypes: c.cargoTypes ?? [],
});

const fetchCommodities = async (
  params: Record<string, string>,
): Promise<MaerskCommodity[]> => {
  if (!envConfig.MAERSK_API_KEY) {
    console.error("[maersk] MAERSK_API_KEY is not configured");
    throw new AppError(UNAVAILABLE_MESSAGE, 503);
  }

  try {
    const { data } = await maerskCommodities.get<{
      commodities?: MaerskCommodity[];
    }>("", { params });
    return Array.isArray(data?.commodities) ? data.commodities : [];
  } catch (error) {
    // Maersk answers 404 when nothing matches — that's an empty result, not an outage.
    if (error instanceof AxiosError && error.response?.status === 404)
      return [];

    console.error(
      "[maersk] Commodities API request failed:",
      error instanceof AxiosError
        ? `${error.response?.status ?? error.code} ${JSON.stringify(error.response?.data ?? "")}`
        : error,
    );
    throw new AppError(UNAVAILABLE_MESSAGE, 503);
  }
};

// 0 = name starts with the query, 1 = a word starts with it, 2 = mid-word match
const toWords = (text: string) =>
  ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;

const matchRank = (name: string, query: string) => {
  const words = toWords(name);
  const needle = toWords(query);
  if (words.startsWith(needle)) return 0;
  if (words.includes(needle)) return 1;
  return 2;
};

// Searches by name, or by HS code when the query is a 6-digit number
export const searchCommodities = async (
  query: string,
): Promise<Commodity[]> => {
  const lowerQuery = query.toLowerCase();
  const key = `search:${lowerQuery}`;
  const cached = getCached<Commodity[]>(key);
  if (cached) return cached;

  const isHsCode = COMMODITY_CODE_REGEX.test(query);
  const raw = await fetchCommodities(
    isHsCode ? { hsCommodityCode: query } : { commodityName: query },
  );

  const seen = new Set<string>();

  const results = raw
    .filter((c) => {
      if (!c.commodityCode || seen.has(c.commodityCode)) return false;
      seen.add(c.commodityCode);
      return true;
    })
    .map(toCommodity)
    .sort((a, b) => {
      if (!isHsCode) {
        const rank = matchRank(a.name, lowerQuery) - matchRank(b.name, lowerQuery);
        if (rank) return rank;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_RESULTS);

  setCached(key, results, SEARCH_TTL);
  return results;
};

export const getCommodityByCode = async (
  code: string,
): Promise<Commodity | null> => {
  const normalized = code.trim();
  if (!COMMODITY_CODE_REGEX.test(normalized)) return null;

  const key = `code:${normalized}`;
  const cached = getCached<Commodity | null>(key);
  if (cached !== undefined) return cached;

  const raw = await fetchCommodities({ commodityCode: normalized });
  const match = raw.find((c) => c.commodityCode === normalized);
  const result = match ? toCommodity(match) : null;

  setCached(key, result, LOOKUP_TTL);
  return result;
};
