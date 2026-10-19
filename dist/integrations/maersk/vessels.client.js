import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
import { createTtlCache } from "./cache.js";
export const VESSEL_IMO_REGEX = /^\d{7}$/;
// Maersk uses call sign 99999 for barges and placeholder vessels, and names
// like "PENDING MOTHER VSL" or "DUMMY" for a vessel not yet assigned
export const isPlaceholderVessel = (name, callSign) => callSign === "99999" || /DUMMY|PENDING/i.test(name ?? "");
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
        !isPlaceholderVessel(v.vesselLongName || v.vesselShortName, v.vesselCallSign))
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
// Build years by IMO, for the vessels on sailing routes (the schedules
// don't carry them). Kept a month, since they never change; null records a
// vessel Maersk has no year for, so it isn't asked again.
const BUILT_TTL = 30 * 24 * 60 * 60 * 1000;
const builtCache = createTtlCache(2000);
export const getBuiltYears = async (imos) => {
    const wanted = [...new Set(imos.filter((imo) => VESSEL_IMO_REGEX.test(imo)))];
    const missing = wanted.filter((imo) => builtCache.get(imo) === undefined);
    if (missing.length) {
        try {
            const found = await fetchVessels({ vesselIMONumbers: missing.join(",") });
            const years = new Map(found
                .filter((v) => v.vesselIMONumber && v.vesselBuiltYear)
                .map((v) => [String(v.vesselIMONumber), v.vesselBuiltYear]));
            for (const imo of missing)
                builtCache.set(imo, years.get(imo) ?? null, BUILT_TTL);
        }
        catch {
            // A route without build years is still a route: leave them out
        }
    }
    return Object.fromEntries(wanted.flatMap((imo) => {
        const year = builtCache.get(imo);
        return year ? [[imo, year]] : [];
    }));
};
//# sourceMappingURL=vessels.client.js.map