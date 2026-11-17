import { RATE_CONTAINER_SIZES, } from "../../utils/interface.js";
// The rules contract rates live by, as plain functions with no database
// access, so they can be tested directly. The frontend was built against a
// stand-in that behaves the same way (frontend/src/services/api/rateMock.ts).
export const EXPIRING_SOON_DAYS = 7;
const LAGOS = "Africa/Lagos";
// ---- Dates ------------------------------------------------------------------
// Rates are valid between two YYYY-MM-DD dates, both included. Days are
// Lagos days: a rate ending 30 Nov is still valid at 23:30 in Lagos.
export const lagosToday = (now = new Date()) => 
// en-CA formats as YYYY-MM-DD
new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(now);
export const addDays = (isoDate, days) => {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000);
export const RATE_STATUSES = [
    "scheduled",
    "active",
    "expiring",
    "expired",
];
export const isValidOn = (rate, day) => rate.validFrom <= day && day <= rate.validTo;
export const rateStatus = (rate, today) => {
    if (rate.validFrom > today)
        return "scheduled";
    if (rate.validTo < today)
        return "expired";
    return daysBetween(today, rate.validTo) <= EXPIRING_SOON_DAYS
        ? "expiring"
        : "active";
};
// The same statuses as a database filter on the stored dates.
export const statusFilter = (status, today) => {
    const soon = addDays(today, EXPIRING_SOON_DAYS);
    switch (status) {
        case "scheduled":
            return { validFrom: { $gt: today } };
        case "expired":
            return { validTo: { $lt: today } };
        case "expiring":
            return { validFrom: { $lte: today }, validTo: { $gte: today, $lte: soon } };
        case "active":
            return { validFrom: { $lte: today }, validTo: { $gt: soon } };
    }
};
// Two date ranges share at least one day.
export const overlaps = (a, b) => a.validFrom <= b.validTo && b.validFrom <= a.validTo;
// Expiring now ends the rate yesterday, so customers stop seeing it at once.
export const expiredDates = (rate, today) => {
    const yesterday = addDays(today, -1);
    return {
        validFrom: rate.validFrom > yesterday ? yesterday : rate.validFrom,
        validTo: yesterday,
    };
};
// ---- Months -------------------------------------------------------------------
// Customers look rates up a month at a time, from this month on. This month
// runs from today to its last day (rates that have ended stay hidden); a later
// month covers all of its days.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// The furthest ahead the month picker lists, so a long rate can't list years.
const MAX_MONTHS = 24;
export const monthOf = (isoDate) => isoDate.slice(0, 7);
const lastDayOf = (month) => addDays(`${addMonths(month, 1)}-01`, -1);
const addMonths = (month, n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
};
/** The days a month covers for customers, or null for a past or bad month. */
export const monthWindow = (month, today) => {
    if (!MONTH.test(month) || month < monthOf(today))
        return null;
    return {
        from: month === monthOf(today) ? today : `${month}-01`,
        to: lastDayOf(month),
    };
};
/** This month, then every later month at least one of these rates is valid in. */
export const monthsWithRates = (rates, today) => {
    const first = monthOf(today);
    const last = addMonths(first, MAX_MONTHS - 1);
    const months = new Set([first]);
    for (const r of rates) {
        if (r.validTo < today)
            continue;
        let m = monthOf(r.validFrom > today ? r.validFrom : today);
        const end = monthOf(r.validTo) < last ? monthOf(r.validTo) : last;
        for (; m <= end; m = addMonths(m, 1))
            months.add(m);
    }
    return [...months].sort();
};
export const rateAccess = (user, verified) => {
    if (user.role !== "customer")
        return "allowed";
    if (user.customerTier === "premium")
        return "premium";
    return verified ? "allowed" : "unverified";
};
const norm = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
export const sameLane = (a, b) => a.origin.code === b.origin.code && a.destination.code === b.destination.code;
// The same commodity: by Maersk code when both have one, else by name.
export const sameCommodity = (a, b) => a.commodityCode && b.commodityCode
    ? a.commodityCode === b.commodityCode
    : norm(a.commodity) === norm(b.commodity);
// The same place in the rate sheet: lane, size and commodity.
export const sameSlot = (a, b) => sameLane(a, b) &&
    a.containerSize === b.containerSize &&
    sameCommodity(a, b);
// A saved rate the new one takes the place of: same slot, same start date.
export const findReplaced = (saved, input) => saved.find((r) => sameSlot(r, input) && r.validFrom === input.validFrom) ??
    null;
// Saved rates in the same slot whose dates overlap the new one, other than
// the one it replaces. Customers only see the one saved last.
export const findOverlaps = (saved, input, except) => saved.filter((r) => r !== except && sameSlot(r, input) && overlaps(r, input));
// A saved rate answers an open request for its lane and commodity, asked
// for its size or for any size.
export const answersRequest = (rate, request) => request.status === "open" &&
    sameLane(rate, request) &&
    sameCommodity(rate, {
        commodity: request.commodity.name,
        commodityCode: request.commodity.code,
    }) &&
    (!request.containerSize || request.containerSize === rate.containerSize);
// Which open requests these saved rates answer, and by which rate. An
// expired rate answers nothing (the customer couldn't use it); when several
// answer one request, the one starting soonest wins.
export const matchAnswered = (rates, requests, today) => {
    const usable = rates.filter((r) => r.validTo >= today);
    const matched = [];
    for (const request of requests) {
        const rate = usable
            .filter((r) => answersRequest(r, request))
            .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
        if (rate)
            matched.push({ request, rate });
    }
    return matched;
};
// ---- Customer search ----------------------------------------------------------
export const sizeOrder = (size) => RATE_CONTAINER_SIZES.indexOf(size);
// Rates valid in a month, one commodity on one lane per group. Every rate is
// kept: a size can have two in a month (1–14 Dec, then 15–31 Dec), each shown
// with its dates. Rates come in size order, then by start date; groups come
// back filtered by the commodity words and sorted by origin, then commodity.
export const groupRates = (rates, q = "") => {
    const groups = new Map();
    for (const r of rates) {
        const key = `${r.origin.code}|${r.destination.code}|${norm(r.commodity)}`;
        const group = groups.get(key) ?? {
            key: `${r.origin.code}|${r.destination.code}|${r.commodity}`,
            origin: r.origin,
            destination: r.destination,
            commodity: r.commodity,
            rates: [],
            fromBasic: null,
            validFrom: r.validFrom,
            validTo: r.validTo,
        };
        group.rates.push(r);
        groups.set(key, group);
    }
    const all = [...groups.values()].map((g) => {
        const sorted = [...g.rates].sort((a, b) => sizeOrder(a.containerSize) - sizeOrder(b.containerSize) ||
            a.validFrom.localeCompare(b.validFrom));
        const cheapest = sorted
            .map((r) => r.charges.find((c) => c.code === "BAS"))
            .filter((c) => !!c)
            .sort((a, b) => a.amount - b.amount)[0];
        return {
            ...g,
            rates: sorted,
            fromBasic: cheapest
                ? { amount: cheapest.amount, currency: cheapest.currency }
                : null,
            validFrom: sorted.map((r) => r.validFrom).sort()[0],
            validTo: sorted.map((r) => r.validTo).sort().reverse()[0],
        };
    });
    const words = norm(q).split(" ").filter(Boolean);
    const matching = all
        .filter((g) => words.every((w) => g.commodity.toLowerCase().includes(w)))
        .sort((a, b) => a.origin.city.localeCompare(b.origin.city) ||
        a.commodity.localeCompare(b.commodity));
    return { groups: matching, totalAll: all.length };
};
// Lanes with a rate in the chosen month, for the customer's quick picks.
export const lanesFrom = (rates) => {
    const lanes = new Map();
    for (const r of rates) {
        const key = `${r.origin.code}-${r.destination.code}`;
        const entry = lanes.get(key) ?? {
            lane: { origin: r.origin, destination: r.destination, sizes: [], commodities: 0 },
            commodities: new Set(),
        };
        if (!entry.lane.sizes.includes(r.containerSize))
            entry.lane.sizes.push(r.containerSize);
        entry.commodities.add(norm(r.commodity));
        lanes.set(key, entry);
    }
    return [...lanes.values()].map(({ lane, commodities }) => ({
        ...lane,
        commodities: commodities.size,
        sizes: [...lane.sizes].sort((a, b) => sizeOrder(a) - sizeOrder(b)),
    }));
};
// ---- Paging and messages --------------------------------------------------------
export const pageOf = (items, page, limit) => items.slice((page - 1) * limit, page * limit);
const requestsResolved = (n) => `${n} rate ${n === 1 ? "request" : "requests"} resolved`;
// "Rate added" / "Rate updated. 2 rate requests resolved."
export const savedMessage = (verb, resolved) => resolved ? `Rate ${verb}. ${requestsResolved(resolved)}.` : `Rate ${verb}`;
// "Import done: 90 added, 6 replaced, 1 rate request resolved."
export const importMessage = (created, replaced, resolved) => {
    const parts = [
        created && `${created} added`,
        replaced && `${replaced} replaced`,
        resolved && requestsResolved(resolved),
    ].filter(Boolean);
    return `Import done: ${parts.join(", ") || "nothing to import"}.`;
};
// ---- Import keys ----------------------------------------------------------------
// The same keys as the frontend (useRateImport's portKey and rate.ts's
// commodityRefKey): matches come back under them and admin's choices are
// remembered under them.
export const portKey = (raw) => norm(raw);
export const commodityRefKey = (ref) => ref.kind === "maersk"
    ? `maersk:${ref.code.trim().toUpperCase()}`
    : `text:${norm(ref.text)}`;
// Text typed into a search box, safe to use inside a regular expression.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//# sourceMappingURL=rules.js.map