import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
import { createTtlCache } from "./cache.js";
export const VESSEL_IMO_REGEX = /^\d{7}$/;
// Maersk uses this call sign for barges and placeholder vessels
const PLACEHOLDER_CALL_SIGN = "99999";
const SEARCH_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_RESULTS = 15;
const UNAVAILABLE_MESSAGE = "Vessel search is temporarily unavailable. Please try again shortly.";
const maerskVessels = axios.create({
    baseURL: envConfig.MAERSK_VESSELS_URL,
    timeout: 10_000,
    headers: {
        "Consumer-Key": envConfig.MAERSK_API_KEY,
        Accept: "application/json",
    },
});
const { get: getCached, set: setCached } = createTtlCache(MAX_CACHE_ENTRIES);
const toVessel = (v) => ({
    name: (v.vesselLongName || v.vesselShortName).trim(),
    imo: v.vesselIMONumber ? String(v.vesselIMONumber) : undefined,
    callSign: v.vesselCallSign,
    flag: v.vesselFlagCode,
    builtYear: v.vesselBuiltYear,
    teu: v.vesselCapacityTEU,
});
const fetchVessels = async (params) => {
    if (!envConfig.MAERSK_API_KEY) {
        console.error("[maersk] MAERSK_API_KEY is not configured");
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
    try {
        const { data } = await maerskVessels.get("", { params });
        return Array.isArray(data) ? data : [];
    }
    catch (error) {
        // Maersk answers 404 when nothing matches — that's an empty result, not an outage.
        if (error instanceof AxiosError && error.response?.status === 404)
            return [];
        console.error("[maersk] Vessels API request failed:", error instanceof AxiosError
            ? `${error.response?.status ?? error.code} ${JSON.stringify(error.response?.data ?? "")}`
            : error);
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
};
export const searchVessels = async (query) => {
    const key = `search:${query.toLowerCase()}`;
    const cached = getCached(key);
    if (cached)
        return cached;
    const raw = await fetchVessels({ vesselNames: query });
    const seen = new Set();
    const upperQuery = query.toUpperCase();
    const results = raw
        .filter((v) => v.vesselShortName &&
        v.vesselCallSign !== PLACEHOLDER_CALL_SIGN &&
        !/DUMMY/i.test(v.vesselLongName || v.vesselShortName))
        .map(toVessel)
        .filter((v) => {
        const id = v.imo ?? v.name.toUpperCase();
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    })
        .sort((a, b) => {
        if (!!a.imo !== !!b.imo)
            return a.imo ? -1 : 1;
        const aPrefix = a.name.toUpperCase().startsWith(upperQuery);
        const bPrefix = b.name.toUpperCase().startsWith(upperQuery);
        if (aPrefix !== bPrefix)
            return aPrefix ? -1 : 1;
        return a.name.localeCompare(b.name);
    })
        .slice(0, MAX_RESULTS);
    setCached(key, results, SEARCH_TTL);
    return results;
};
//# sourceMappingURL=vessels.client.js.map