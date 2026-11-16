import {
  RATE_CONTAINER_SIZES,
  type IRateCharge,
  type IRatePort,
  type RateContainerSize,
} from "../../utils/interface.js";

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

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

type Dated = { validFrom: string; validTo: string };

export type RateStatus = "scheduled" | "active" | "expiring" | "expired";
export const RATE_STATUSES: RateStatus[] = [
  "scheduled",
  "active",
  "expiring",
  "expired",
];

export const isValidOn = (rate: Dated, day: string) =>
  rate.validFrom <= day && day <= rate.validTo;

export const rateStatus = (rate: Dated, today: string): RateStatus => {
  if (rate.validFrom > today) return "scheduled";
  if (rate.validTo < today) return "expired";
  return daysBetween(today, rate.validTo) <= EXPIRING_SOON_DAYS
    ? "expiring"
    : "active";
};

// The same statuses as a database filter on the stored dates.
export const statusFilter = (status: RateStatus, today: string) => {
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
export const overlaps = (a: Dated, b: Dated) =>
  a.validFrom <= b.validTo && b.validFrom <= a.validTo;

// Expiring now ends the rate yesterday, so customers stop seeing it at once.
export const expiredDates = (rate: Dated, today: string): Dated => {
  const yesterday = addDays(today, -1);
  return {
    validFrom: rate.validFrom > yesterday ? yesterday : rate.validFrom,
    validTo: yesterday,
  };
};

// ---- Which rate is which ----------------------------------------------------

export interface RateLike extends Dated {
  _id?: unknown;
  origin: IRatePort;
  destination: IRatePort;
  containerSize: RateContainerSize;
  commodity: string;
  commodityCode?: string;
  charges: IRateCharge[];
  updatedAt?: Date | string;
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const sameLane = (
  a: { origin: IRatePort; destination: IRatePort },
  b: { origin: IRatePort; destination: IRatePort },
) => a.origin.code === b.origin.code && a.destination.code === b.destination.code;

// The same commodity: by Maersk code when both have one, else by name.
export const sameCommodity = (
  a: { commodity: string; commodityCode?: string },
  b: { commodity: string; commodityCode?: string },
) =>
  a.commodityCode && b.commodityCode
    ? a.commodityCode === b.commodityCode
    : norm(a.commodity) === norm(b.commodity);

// The same place in the rate sheet: lane, size and commodity.
export const sameSlot = (a: RateLike, b: RateLike) =>
  sameLane(a, b) &&
  a.containerSize === b.containerSize &&
  sameCommodity(a, b);

// A saved rate the new one takes the place of: same slot, same start date.
export const findReplaced = <T extends RateLike>(saved: T[], input: RateLike) =>
  saved.find((r) => sameSlot(r, input) && r.validFrom === input.validFrom) ??
  null;

// Saved rates in the same slot whose dates overlap the new one, other than
// the one it replaces. Customers only see the one saved last.
export const findOverlaps = <T extends RateLike>(
  saved: T[],
  input: RateLike,
  except?: T | null,
) => saved.filter((r) => r !== except && sameSlot(r, input) && overlaps(r, input));

// ---- Rate requests ------------------------------------------------------------

export interface RequestLike {
  origin: IRatePort;
  destination: IRatePort;
  commodity: { code: string; name: string };
  containerSize?: RateContainerSize;
  status: "open" | "resolved";
}

// A saved rate answers an open request for its lane and commodity, asked
// for its size or for any size.
export const answersRequest = (rate: RateLike, request: RequestLike) =>
  request.status === "open" &&
  sameLane(rate, request) &&
  sameCommodity(rate, {
    commodity: request.commodity.name,
    commodityCode: request.commodity.code,
  }) &&
  (!request.containerSize || request.containerSize === rate.containerSize);

// ---- Customer search ----------------------------------------------------------

export const sizeOrder = (size: string) =>
  RATE_CONTAINER_SIZES.indexOf(size as RateContainerSize);

export interface RateGroup<T extends RateLike> {
  key: string;
  origin: IRatePort;
  destination: IRatePort;
  commodity: string;
  rates: T[];
  fromBasic: { amount: number; currency: string } | null;
  validTo: string;
}

const time = (value: Date | string | undefined) =>
  value ? new Date(value).getTime() : 0;

// Rates valid today, one commodity on one lane per group, one rate per size:
// when two are valid for the same size, the one saved last wins. Groups come
// back filtered by the commodity words and sorted by origin, then commodity.
export const groupRates = <T extends RateLike>(rates: T[], q = "") => {
  const groups = new Map<string, RateGroup<T>>();
  for (const r of rates) {
    const key = `${r.origin.code}|${r.destination.code}|${norm(r.commodity)}`;
    const group = groups.get(key) ?? {
      key: `${r.origin.code}|${r.destination.code}|${r.commodity}`,
      origin: r.origin,
      destination: r.destination,
      commodity: r.commodity,
      rates: [],
      fromBasic: null,
      validTo: r.validTo,
    };
    const held = group.rates.findIndex((x) => x.containerSize === r.containerSize);
    if (held < 0) group.rates.push(r);
    else if (time(group.rates[held].updatedAt) < time(r.updatedAt))
      group.rates[held] = r;
    groups.set(key, group);
  }

  const all = [...groups.values()].map((g) => {
    const sorted = [...g.rates].sort(
      (a, b) => sizeOrder(a.containerSize) - sizeOrder(b.containerSize),
    );
    const cheapest = sorted
      .map((r) => r.charges.find((c) => c.code === "BAS"))
      .filter((c): c is IRateCharge => !!c)
      .sort((a, b) => a.amount - b.amount)[0];
    return {
      ...g,
      rates: sorted,
      fromBasic: cheapest
        ? { amount: cheapest.amount, currency: cheapest.currency }
        : null,
      validTo: sorted.map((r) => r.validTo).sort()[0],
    };
  });

  const words = norm(q).split(" ").filter(Boolean);
  const matching = all
    .filter((g) => words.every((w) => g.commodity.toLowerCase().includes(w)))
    .sort(
      (a, b) =>
        a.origin.city.localeCompare(b.origin.city) ||
        a.commodity.localeCompare(b.commodity),
    );
  return { groups: matching, totalAll: all.length };
};

export interface RateLane {
  origin: IRatePort;
  destination: IRatePort;
  sizes: RateContainerSize[];
  commodities: number;
}

// Lanes with a rate valid today, for the customer's quick picks.
export const lanesFrom = (rates: RateLike[]): RateLane[] => {
  const lanes = new Map<
    string,
    { lane: RateLane; commodities: Set<string> }
  >();
  for (const r of rates) {
    const key = `${r.origin.code}-${r.destination.code}`;
    const entry = lanes.get(key) ?? {
      lane: { origin: r.origin, destination: r.destination, sizes: [], commodities: 0 },
      commodities: new Set<string>(),
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

export const pageOf = <T>(items: T[], page: number, limit: number) =>
  items.slice((page - 1) * limit, page * limit);

const requestsResolved = (n: number) =>
  `${n} rate ${n === 1 ? "request" : "requests"} resolved`;

// "Rate added" / "Rate updated. 2 rate requests resolved."
export const savedMessage = (verb: "added" | "updated", resolved: number) =>
  resolved ? `Rate ${verb}. ${requestsResolved(resolved)}.` : `Rate ${verb}`;

// "Import done: 90 added, 6 replaced, 1 rate request resolved."
export const importMessage = (
  created: number,
  replaced: number,
  resolved: number,
) => {
  const parts = [
    created && `${created} added`,
    replaced && `${replaced} replaced`,
    resolved && requestsResolved(resolved),
  ].filter(Boolean);
  return `Import done: ${parts.join(", ") || "nothing to import"}.`;
};

// Text typed into a search box, safe to use inside a regular expression.
export const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
