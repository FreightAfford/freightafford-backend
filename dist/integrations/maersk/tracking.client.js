import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
import { createTtlCache } from "./cache.js";
// The public-access tier has a small quota (429 "Rate limit quota violation",
// no quota headers), so results are cached for an hour and the last good copy
// is kept for a week to serve when Maersk refuses a call.
const CACHE_TTL = 60 * 60 * 1000;
const STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
// After a 429, stop calling Maersk for a while instead of burning more quota
const QUOTA_COOLDOWN = 30 * 60 * 1000;
const UNAVAILABLE_MESSAGE = "Live tracking is temporarily unavailable. Please try again shortly.";
const QUOTA_MESSAGE = "Maersk's live tracking limit has been reached for now. Tracking will be back later.";
let quotaBlockedUntil = 0;
export const isTrackingQuotaBlocked = () => Date.now() < quotaBlockedUntil;
const maerskTracking = axios.create({
    baseURL: envConfig.MAERSK_TRACKING_URL,
    timeout: 15_000,
    headers: {
        "Consumer-Key": envConfig.MAERSK_API_KEY,
        Accept: "application/json",
    },
});
const { get: getCached, set: setCached } = createTtlCache(MAX_CACHE_ENTRIES);
const { get: getStale, set: setStale } = createTtlCache(MAX_CACHE_ENTRIES);
const EQUIPMENT_LABELS = {
    LOAD: "Loaded on vessel",
    DISC: "Discharged from vessel",
    STUF: "Container stuffed",
    STRP: "Container stripped",
    PICK: "Container picked up",
    DROP: "Container dropped off",
    INSP: "Container inspected",
    RSEA: "Container resealed",
    RMVD: "Container removed",
};
const SHIPMENT_LABELS = {
    RECE: "Shipping instructions received",
    DRFT: "Draft bill of lading prepared",
    PENA: "Pending approval",
    ISSU: "Bill of lading issued",
    RELS: "Cargo released",
    SURR: "Bill of lading surrendered",
    CONF: "Booking confirmed",
    SUBM: "Submitted",
    APPR: "Approved",
    REJE: "Rejected",
    HOLD: "On hold",
    CANC: "Cancelled",
    COMP: "Completed",
    VOID: "Voided",
};
const labelFor = (e, code) => {
    const actual = e.eventClassifierCode === "ACT";
    if (e.eventType === "TRANSPORT") {
        if (code === "DEPA")
            return actual ? "Vessel departed" : "Vessel departure";
        if (code === "ARRI")
            return actual ? "Vessel arrived" : "Vessel arrival";
    }
    if (e.eventType === "EQUIPMENT") {
        const empty = e.emptyIndicatorCode === "EMPTY";
        if (code === "GTOT")
            return empty ? "Empty container picked up" : "Full container gated out";
        if (code === "GTIN")
            return empty ? "Empty container returned" : "Full container gated in";
        if (EQUIPMENT_LABELS[code])
            return EQUIPMENT_LABELS[code];
    }
    if (e.eventType === "SHIPMENT" && SHIPMENT_LABELS[code])
        return SHIPMENT_LABELS[code];
    return code;
};
const toShipmentEvent = (e) => {
    const code = e.transportEventTypeCode ??
        e.equipmentEventTypeCode ??
        e.shipmentEventTypeCode ??
        "";
    const call = e.transportCall;
    return {
        id: e.eventID,
        type: e.eventType,
        code,
        classifier: e.eventClassifierCode,
        dateTime: e.eventDateTime,
        label: labelFor(e, code),
        location: call
            ? { name: call.location?.locationName, code: call.UNLocationCode }
            : undefined,
        vessel: call?.vessel?.vesselName
            ? { name: call.vessel.vesselName, imo: call.vessel.vesselIMONumber }
            : undefined,
        voyage: call?.vessel
            ? (call.carrierVoyageNumber ?? call.exportVoyageNumber)
            : undefined,
        container: e.equipmentReference,
        empty: e.emptyIndicatorCode ? e.emptyIndicatorCode === "EMPTY" : undefined,
    };
};
const fetchPublicEvents = async (params) => {
    if (!envConfig.MAERSK_API_KEY) {
        console.error("[maersk] MAERSK_API_KEY is not configured");
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
    if (isTrackingQuotaBlocked())
        throw new AppError(QUOTA_MESSAGE, 503);
    try {
        const { data } = await maerskTracking.get("", {
            params,
        });
        return Array.isArray(data?.events) ? data.events : [];
    }
    catch (error) {
        // Maersk answers 404 for an unknown reference — no events yet, not an outage.
        if (error instanceof AxiosError && error.response?.status === 404)
            return [];
        if (error instanceof AxiosError && error.response?.status === 429) {
            quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN;
            console.error(`[maersk] Track & Trace quota exceeded; pausing calls until ${new Date(quotaBlockedUntil).toISOString()}`);
            throw new AppError(QUOTA_MESSAGE, 503);
        }
        console.error("[maersk] Track & Trace request failed:", error instanceof AxiosError
            ? `${error.response?.status ?? error.code} ${JSON.stringify(error.response?.data ?? "")}`
            : error);
        throw new AppError(UNAVAILABLE_MESSAGE, 503);
    }
};
const time = (e) => new Date(e.dateTime).getTime();
// `fresh` skips the cached copy (the sync job wants current data) but still
// refreshes the cache for the booking page. Without `fresh`, a failed call
// falls back to the last good copy so the page keeps showing events.
export const getShipmentEvents = async (ref, { fresh = false } = {}) => {
    const [type, value] = Object.entries(ref)[0];
    const key = `${type}:${value.toUpperCase()}`;
    if (!fresh) {
        const cached = getCached(key);
        if (cached)
            return cached;
    }
    let raw;
    try {
        raw = await fetchPublicEvents(ref);
    }
    catch (error) {
        const stale = !fresh && getStale(key);
        if (stale)
            return stale;
        throw error;
    }
    const events = raw.map(toShipmentEvent).sort((a, b) => time(a) - time(b));
    setCached(key, events, CACHE_TTL);
    if (events.length)
        setStale(key, events, STALE_TTL);
    return events;
};
const CLASSIFIER_RANK = { ACT: 3, EST: 2, PLN: 1 };
// Best event for one port call: actual beats estimated beats planned; among
// equals the most recent report wins.
const pickBest = (events) => events.reduce((best, e) => !best || CLASSIFIER_RANK[e.classifier] >= CLASSIFIER_RANK[best.classifier]
    ? e
    : best, null);
const toMilestone = (e) => e
    ? {
        at: e.dateTime,
        classifier: e.classifier,
        locationCode: e.location?.code,
        locationName: e.location?.name,
        vessel: e.vessel,
        voyage: e.voyage,
    }
    : null;
const legKey = (e) => `${e.vessel?.imo ?? e.vessel?.name ?? ""}|${e.voyage ?? ""}`;
// Derives the dates and progress the booking cares about from the raw events.
// POL/POD are the freight request's UN/LOCODEs; when they're missing (legacy
// requests) or don't appear in the events, falls back to the first departure
// and the last arrival.
export const deriveShipmentSummary = (events, { polCode, podCode } = {}) => {
    const departures = events.filter((e) => e.type === "TRANSPORT" && e.code === "DEPA");
    const arrivals = events.filter((e) => e.type === "TRANSPORT" && e.code === "ARRI");
    const pol = (polCode && departures.some((e) => e.location?.code === polCode)
        ? polCode
        : departures[0]?.location?.code) ?? undefined;
    const pod = (podCode && arrivals.some((e) => e.location?.code === podCode)
        ? podCode
        : arrivals.at(-1)?.location?.code) ?? undefined;
    const departure = pickBest(departures.filter((e) => e.location?.code === pol));
    const arrival = pickBest(arrivals.filter((e) => e.location?.code === pod));
    const dischargedAtPod = events.some((e) => e.type === "EQUIPMENT" &&
        e.code === "DISC" &&
        e.classifier === "ACT" &&
        e.location?.code === pod);
    const legs = new Map();
    for (const e of [...departures, ...arrivals].sort((a, b) => time(a) - time(b))) {
        const key = legKey(e);
        const leg = legs.get(key) ?? { vessel: e.vessel, voyage: e.voyage };
        const stop = {
            name: e.location?.name,
            code: e.location?.code,
            at: e.dateTime,
            classifier: e.classifier,
        };
        if (e.code === "DEPA" && !leg.from)
            leg.from = stop;
        if (e.code === "ARRI")
            leg.to = stop;
        legs.set(key, leg);
    }
    return {
        departure: toMilestone(departure),
        arrival: toMilestone(arrival),
        hasDeparted: departure?.classifier === "ACT",
        hasArrived: arrival?.classifier === "ACT" || (!!pod && dischargedAtPod),
        legs: [...legs.values()],
    };
};
//# sourceMappingURL=tracking.client.js.map