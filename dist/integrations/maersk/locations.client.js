import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
export const UN_LOCODE_REGEX = /^[A-Z]{2}[A-Z2-9]{3}$/;
const SEARCH_TTL = 24 * 60 * 60 * 1000;
const LOOKUP_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_RESULTS = 15;
const UNAVAILABLE_MESSAGE = "Location search is temporarily unavailable. Please try again shortly.";
const maerskLocations = axios.create({
    baseURL: envConfig.MAERSK_LOCATIONS_URL,
    timeout: 10_000,
    headers: {
        "Consumer-Key": envConfig.MAERSK_API_KEY,
        Accept: "application/json",
    },
});
// Small TTL cache. Map preserves insertion order, so the first key is the oldest.
const cache = new Map();
const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry)
        return undefined;
    if (entry.expiresAt < Date.now()) {
        cache.delete(key);
        return undefined;
    }
    return entry.value;
};
const setCached = (key, value, ttl) => {
    if (cache.size >= MAX_CACHE_ENTRIES)
        cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt: Date.now() + ttl });
};
const toPortLocation = (loc) => ({
    code: loc.UNLocationCode,
    city: loc.cityName,
    country: loc.countryName,
    countryCode: loc.countryCode,
    region: loc.UNRegionName,
    maerskServed: !!loc.hasCYService,
});
const fetchLocations = async (params) => {
    if (!envConfig.MAERSK_API_KEY) {
        console.error("[maersk] MAERSK_API_KEY is not configured");
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
    try {
        const { data } = await maerskLocations.get("", {
            params,
        });
        return Array.isArray(data) ? data : [];
    }
    catch (error) {
        // Maersk answers 404 when nothing matches — that's an empty result, not an outage.
        if (error instanceof AxiosError && error.response?.status === 404)
            return [];
        console.error("[maersk] Locations API request failed:", error instanceof AxiosError
            ? `${error.response?.status ?? error.code} ${JSON.stringify(error.response?.data ?? "")}`
            : error);
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
};
export const searchLocations = async (query) => {
    const key = `search:${query.toLowerCase()}`;
    const cached = getCached(key);
    if (cached)
        return cached;
    const raw = await fetchLocations({
        locationType: "CITY",
        cityName: query,
        limit: 50,
    });
    const seen = new Set();
    const lowerQuery = query.toLowerCase();
    const results = raw
        .filter((loc) => {
        if (!loc.UNLocationCode || seen.has(loc.UNLocationCode))
            return false;
        seen.add(loc.UNLocationCode);
        return true;
    })
        .map(toPortLocation)
        .sort((a, b) => {
        if (a.maerskServed !== b.maerskServed)
            return a.maerskServed ? -1 : 1;
        const aExact = a.city.toLowerCase() === lowerQuery;
        const bExact = b.city.toLowerCase() === lowerQuery;
        if (aExact !== bExact)
            return aExact ? -1 : 1;
        return a.city.localeCompare(b.city);
    })
        .slice(0, MAX_RESULTS);
    setCached(key, results, SEARCH_TTL);
    return results;
};
export const getLocationByCode = async (code) => {
    const normalized = code.trim().toUpperCase();
    if (!UN_LOCODE_REGEX.test(normalized))
        return null;
    const key = `code:${normalized}`;
    const cached = getCached(key);
    if (cached !== undefined)
        return cached;
    const raw = await fetchLocations({ UNLocationCode: normalized, limit: 10 });
    const city = raw.find((loc) => loc.locationType === "CITY") ??
        raw.find((loc) => loc.UNLocationCode === normalized);
    const result = city ? toPortLocation({ ...city, UNLocationCode: normalized }) : null;
    setCached(key, result, LOOKUP_TTL);
    return result;
};
export const formatPortName = (loc) => `${loc.city}, ${loc.country}`;
//# sourceMappingURL=locations.client.js.map