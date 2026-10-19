import axios, { AxiosError } from "axios";
import envConfig from "../../configurations/env.configuration.js";
import AppError from "../../errors/app.error.js";
import { createTtlCache } from "./cache.js";
import { getBuiltYears, isPlaceholderVessel } from "./vessels.client.js";

// Maersk Ocean – Commercial Schedules [DCSA]. Auth is the Consumer-Key header
// only (no OAuth). Used here: GET /v1/active-ports (every port Maersk calls
// at) and GET /v1/port-schedules (vessel calls at one port; one call covers
// about three months from `date`, one entry per terminal).
//
// The key's quota is 50 calls an hour across the whole product, and a 429
// once it's spent. So results are cached hard, one port's schedule answers
// any date window it covers, and the last good copy is served when Maersk
// can't be called.

interface MaerskActivePort {
  countryCode: string;
  countryName: string;
  UNLocationCode?: string;
  cityName?: string;
  portName?: string;
}

interface MaerskTimestamp {
  eventTypeCode: "ARRI" | "DEPA";
  eventClassifierCode: "PLN" | "EST" | "ACT";
  eventDateTime: string;
}

interface MaerskVesselSchedule {
  servicePartners?: {
    carrierServiceName?: string;
    carrierServiceCode?: string;
    carrierImportVoyageNumber?: string;
    carrierExportVoyageNumber?: string;
  }[];
  vessel?: {
    vesselIMONumber?: string;
    name?: string;
    flag?: string;
    callSign?: string;
  };
  isDummyVessel?: boolean;
  timestamps?: MaerskTimestamp[];
  cutOffTimes?: { cutOffDateTimeCode: string; cutOffDateTime: string }[];
}

export interface MaerskPortSchedule {
  location?: {
    locationName?: string;
    facilityName?: string;
    UNLocationCode?: string;
    facilitySMDGCode?: string;
  };
  vesselSchedules?: MaerskVesselSchedule[];
}

export interface ActivePort {
  code: string;
  name: string;
  countryCode: string;
  country: string;
}

// Times keep the port's own UTC offset, e.g. "2026-10-21T12:00:00+01:00"
export interface ScheduleTime {
  planned?: string;
  estimated?: string;
  actual?: string;
}

export interface PortCall {
  id: string;
  // null when Maersk hasn't assigned a vessel yet
  vessel: { name: string; imo?: string; flag?: string } | null;
  services: {
    name: string;
    code: string;
    voyageIn: string;
    voyageOut?: string;
  }[];
  arrival: ScheduleTime;
  departure: ScheduleTime;
  // DCO documents, FCO full container, VCO VGM, …
  cutOffs: { code: string; at: string }[];
}

export interface PortTerminal {
  name: string;
  smdgCode?: string;
  calls: PortCall[];
}

export interface PortScheduleResult {
  port: { code: string; name: string; country: string; utcOffset: string };
  terminals: PortTerminal[];
  fetchedAt: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Our own ceiling, below Maersk's 50, so a burst never reaches the 429
const HOURLY_BUDGET = 45;
// After a 429, stop calling Maersk for a while instead of burning more quota
const QUOTA_COOLDOWN = 30 * 60 * 1000;

const PORTS_TTL = DAY;
const SCHEDULE_TTL = 6 * HOUR;
// The last good copy, served when Maersk can't be called
const STALE_TTL = 7 * DAY;
// How far past its `date` one schedule call is trusted to cover (Maersk
// returned about 13 weeks for Apapa)
const COVERAGE_DAYS = 84;
// A port with more terminals than one page holds (10) is rare
const MAX_PAGES = 3;
const MAX_CACHE_ENTRIES = 300;

const UNAVAILABLE_MESSAGE =
  "Sailing schedules are temporarily unavailable. Please try again shortly.";
const QUOTA_MESSAGE =
  "Maersk's schedule limit has been reached for now. Schedules will be back within the hour.";

const maerskSchedules = axios.create({
  baseURL: envConfig.MAERSK_SCHEDULES_URL,
  timeout: 15_000,
  headers: {
    "Consumer-Key": envConfig.MAERSK_API_KEY,
    Accept: "application/json",
  },
});

// Every Maersk call this hour, oldest first
let callTimes: number[] = [];
let blockedUntil = 0;

// Counts a call against the hourly budget, or says no
const spendCall = () => {
  const now = Date.now();
  callTimes = callTimes.filter((t) => now - t < HOUR);
  if (now < blockedUntil || callTimes.length >= HOURLY_BUDGET) return false;
  callTimes.push(now);
  return true;
};

const request = async <T>(
  path: string,
  params: Record<string, string | number>,
  options: { headers?: Record<string, string>; timeout?: number } = {},
): Promise<{ data: T | null; nextCursor?: string }> => {
  if (!envConfig.MAERSK_API_KEY) {
    console.error("[maersk] MAERSK_API_KEY is not configured");
    throw new AppError(UNAVAILABLE_MESSAGE, 503);
  }
  if (!spendCall()) throw new AppError(QUOTA_MESSAGE, 503);
  console.log(
    `[maersk] Commercial Schedules ${path} ${JSON.stringify(params)} (${callTimes.length}/${HOURLY_BUDGET} this hour)`,
  );

  try {
    const res = await maerskSchedules.get<T>(path, { params, ...options });
    const cursor = res.headers["next-page-cursor"];
    return { data: res.data, nextCursor: cursor ? String(cursor) : undefined };
  } catch (error) {
    const status = error instanceof AxiosError ? error.response?.status : undefined;
    // Nothing matches: an empty result, not an outage
    if (status === 404) return { data: null };

    if (status === 429) {
      blockedUntil = Date.now() + QUOTA_COOLDOWN;
      console.error(
        `[maersk] Commercial Schedules quota exceeded; pausing calls until ${new Date(blockedUntil).toISOString()}`,
      );
      throw new AppError(QUOTA_MESSAGE, 503);
    }

    const body = error instanceof AxiosError ? error.response?.data : undefined;
    console.error(
      `[maersk] Commercial Schedules ${path} failed:`,
      error instanceof AxiosError
        ? `${status ?? error.code} ${JSON.stringify(body ?? "")}`
        : error,
    );
    // A request Maersk calls invalid (e.g. a date outside its window) is
    // worth showing as is
    if (status === 400) {
      const message = body?.errors?.[0]?.errorCodeMessage;
      throw new AppError(message || "Maersk couldn't read that search.", 400);
    }
    throw new AppError(UNAVAILABLE_MESSAGE, 503);
  }
};

// Serve `stale` instead of failing when Maersk is down or the quota is spent
const withFallback = async <T>(
  load: () => Promise<T>,
  stale: T | undefined,
): Promise<T> => {
  try {
    return await load();
  } catch (error) {
    if (stale && error instanceof AppError && error.statusCode === 503) {
      console.warn("[maersk] Serving a stored copy of Commercial Schedules data");
      return stale;
    }
    throw error;
  }
};

// ---- Active ports ----------------------------------------------------------

const portsCache = createTtlCache(1);
const portsStale = createTtlCache(1);

export const toActivePorts = (raw: MaerskActivePort[]): ActivePort[] => {
  const seen = new Set<string>();
  return raw
    .filter((p) => {
      if (!p.UNLocationCode || seen.has(p.UNLocationCode)) return false;
      seen.add(p.UNLocationCode);
      return true;
    })
    .map((p) => ({
      code: p.UNLocationCode!,
      name: (p.portName || p.cityName || p.UNLocationCode!).trim(),
      countryCode: p.countryCode,
      country: p.countryName,
    }))
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) || a.name.localeCompare(b.name),
    );
};

// Every port Maersk loads or discharges at, all countries in one call
export const getActivePorts = async (): Promise<ActivePort[]> => {
  const cached = portsCache.get<ActivePort[]>("all");
  if (cached) return cached;

  return withFallback(async () => {
    const { data } = await request<MaerskActivePort[]>("/v1/active-ports", {
      carrierCodes: "MAEU",
    });
    const ports = toActivePorts(Array.isArray(data) ? data : []);
    portsCache.set("all", ports, PORTS_TTL);
    portsStale.set("all", ports, STALE_TTL);
    return ports;
  }, portsStale.get<ActivePort[]>("all"));
};

// ---- Port schedules --------------------------------------------------------

// Maersk dates a call it hasn't scheduled 1 Jan 2099 (port time): unknown
const isPlaceholderDate = (dateTime?: string) =>
  !dateTime || dateTime.slice(0, 4) >= "2099";

const CLASSIFIER_KEYS = { PLN: "planned", EST: "estimated", ACT: "actual" } as const;

const toTime = (
  stamps: MaerskTimestamp[],
  type: MaerskTimestamp["eventTypeCode"],
): ScheduleTime => {
  const time: ScheduleTime = {};
  for (const s of stamps) {
    if (s.eventTypeCode !== type || isPlaceholderDate(s.eventDateTime)) continue;
    const key = CLASSIFIER_KEYS[s.eventClassifierCode];
    if (key && !time[key]) time[key] = s.eventDateTime;
  }
  return time;
};

const toVessel = (s: MaerskVesselSchedule): PortCall["vessel"] => {
  const v = s.vessel;
  if (s.isDummyVessel || !v?.name || isPlaceholderVessel(v.name, v.callSign))
    return null;
  return {
    name: v.name.trim(),
    ...(v.vesselIMONumber && { imo: v.vesselIMONumber }),
    ...(v.flag && { flag: v.flag }),
  };
};

export const toPortCalls = (schedules: MaerskVesselSchedule[]): PortCall[] =>
  schedules.map((s) => {
    const stamps = s.timestamps ?? [];
    const arrival = toTime(stamps, "ARRI");
    const departure = toTime(stamps, "DEPA");
    const vessel = toVessel(s);
    const services = (s.servicePartners ?? []).map((p) => ({
      name: p.carrierServiceName || p.carrierServiceCode || "",
      code: p.carrierServiceCode || "",
      voyageIn: p.carrierImportVoyageNumber || "",
      ...(p.carrierExportVoyageNumber && {
        voyageOut: p.carrierExportVoyageNumber,
      }),
    }));
    return {
      id: [
        vessel?.imo ?? "tbn",
        services[0]?.voyageOut ?? services[0]?.voyageIn ?? "",
        arrival.planned ?? arrival.estimated ?? departure.planned ?? "",
      ].join("|"),
      vessel,
      services,
      arrival,
      departure,
      cutOffs: (s.cutOffTimes ?? [])
        .filter((c) => !isPlaceholderDate(c.cutOffDateTime))
        .map((c) => ({ code: c.cutOffDateTimeCode, at: c.cutOffDateTime })),
    };
  });

export const toTerminals = (raw: MaerskPortSchedule[]): PortTerminal[] =>
  raw.map((t) => ({
    name: t.location?.facilityName || t.location?.locationName || "Terminal",
    ...(t.location?.facilitySMDGCode && {
      smdgCode: t.location.facilitySMDGCode,
    }),
    calls: toPortCalls(t.vesselSchedules ?? []),
  }));

const best = (time: ScheduleTime) =>
  time.actual ?? time.estimated ?? time.planned;

// The port-local date of a timestamp: its first ten characters, since the
// offset is kept
const localDay = (dateTime?: string) => dateTime?.slice(0, 10);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);

// Calls at the port on any day from `from` for `days` days (port time)
export const filterWindow = (
  calls: PortCall[],
  from: string,
  days: number,
): PortCall[] => {
  const end = addDays(from, days);
  return calls.filter((call) => {
    const arrives = localDay(best(call.arrival)) ?? localDay(best(call.departure));
    const leaves = localDay(best(call.departure)) ?? arrives;
    return !!arrives && !!leaves && arrives < end && leaves >= from;
  });
};

// "+01:00" from the first time Maersk sent for the port
const utcOffset = (terminals: PortTerminal[]) => {
  for (const t of terminals)
    for (const c of t.calls) {
      const at = best(c.arrival) ?? best(c.departure);
      const match = at && /([+-]\d{2}:\d{2}|Z)$/.exec(at);
      if (match) return match[1] === "Z" ? "+00:00" : match[1];
    }
  return "";
};

interface ScheduleFetch {
  from: string;
  coveredUntil: string;
  terminals: PortTerminal[];
  fetchedAt: number;
}

// Port code → its recent fetches, newest first
const scheduleCache = createTtlCache(MAX_CACHE_ENTRIES);

const fetchPortSchedule = async (
  code: string,
  date: string,
): Promise<ScheduleFetch> => {
  const raw: MaerskPortSchedule[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, nextCursor } = await request<MaerskPortSchedule[]>(
      "/v1/port-schedules",
      { UNLocationCode: code, date, ...(cursor && { cursor }) },
    );
    if (Array.isArray(data)) raw.push(...data);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return {
    from: date,
    coveredUntil: addDays(date, COVERAGE_DAYS),
    terminals: toTerminals(raw),
    fetchedAt: Date.now(),
  };
};

// Vessel calls at `code` from `from` for `days` days. A cached fetch that
// covers the window answers it, so changing the days or moving the date
// forward costs no Maersk call.
export const getPortSchedule = async (
  code: string,
  from: string,
  days: number,
): Promise<PortScheduleResult> => {
  const lastDay = addDays(from, days - 1);
  const fetches = scheduleCache.get<ScheduleFetch[]>(code) ?? [];
  const covering = fetches.filter(
    (f) => f.from <= from && lastDay < f.coveredUntil,
  );
  const fresh = covering.find((f) => Date.now() - f.fetchedAt < SCHEDULE_TTL);

  const source =
    fresh ??
    (await withFallback(async () => {
      const fetched = await fetchPortSchedule(code, from);
      // Newest first; older copies stay for windows only they cover
      scheduleCache.set(
        code,
        [fetched, ...fetches.filter((f) => f.from !== from)].slice(0, 4),
        STALE_TTL,
      );
      return fetched;
    }, covering[0]));

  const port = portsCache.get<ActivePort[]>("all")?.find((p) => p.code === code) ??
    portsStale.get<ActivePort[]>("all")?.find((p) => p.code === code);
  const terminals = source.terminals.map((t) => ({
    ...t,
    calls: filterWindow(t.calls, from, days),
  }));

  return {
    port: {
      code,
      name: port?.name ?? source.terminals[0]?.name ?? code,
      country: port?.country ?? "",
      utcOffset: utcOffset(source.terminals),
    },
    terminals,
    fetchedAt: new Date(source.fetchedAt).toISOString(),
  };
};

// ---- Point to point routes -------------------------------------------------
//
// GET /v1/point-to-point-routes: every route between two places for a
// departure window (up to 56 days, at most 7 days back), for one container
// type. The type only goes through with the Carrier-Extensions-Version
// header, and reefers also need cargoType=REEFER. Maersk answers every
// arrival-date query with a 500, so "arriving by" is worked out here from
// departures. Answers can take around 8 seconds.

// Maersk's 14 container types, as its own schedule search lists them
export const CONTAINER_CODES = [
  "22G1", "42G1", "45G1", "L5G1", "22R1", "45R1", "22U1",
  "42U1", "45U1", "42P1", "45P3", "22P1", "22T3", "42T3",
];
const REEFER_CODES = ["22R1", "45R1"];
export const DEFAULT_CONTAINER = "45G1";

export type RouteDateMode = "departing" | "arriving";

// Every search covers four weeks from (or up to) its date
export const ROUTE_WINDOW_DAYS = 28;
// The longest departure range one Maersk call takes
const ROUTE_FETCH_DAYS = 56;
// How far back Maersk returns departures
export const ROUTE_PAST_DAYS = 7;
const ROUTE_TIMEOUT = 30_000;

interface MaerskPlace {
  location?: { locationName?: string; UNLocationCode?: string };
  dateTime?: string;
}

interface MaerskLeg {
  sequenceNumber?: number;
  transport?: {
    modeOfTransport?: string;
    servicePartners?: {
      carrierServiceName?: string;
      carrierImportVoyageNumber?: string;
      carrierExportVoyageNumber?: string;
    }[];
    vessel?: {
      vesselIMONumber?: string;
      name?: string;
      flag?: string;
      callSign?: string;
    };
  };
  departure: MaerskPlace;
  arrival: MaerskPlace;
}

export interface MaerskRoute {
  placeOfReceipt: MaerskPlace;
  placeOfDelivery: MaerskPlace;
  transitTime?: number;
  routingReference?: string;
  cutOffTimes?: { cutOffDateTimeCode: string; cutOffDateTime: string }[];
  legs?: MaerskLeg[];
}

// A port on a route; `at` keeps the port's own UTC offset
export interface RouteStop {
  code: string;
  name: string;
  terminal?: string;
  at: string;
}

export interface RouteLeg {
  // VESSEL, BARGE, RAIL, TRUCK, …
  mode: string;
  vessel: {
    name: string;
    imo?: string;
    flag?: string;
    callSign?: string;
    builtYear?: number;
  } | null;
  service?: string;
  voyage?: string;
  from: RouteStop;
  to: RouteStop;
}

export interface RouteOption {
  // Maersk's routingReference, which booking will need later
  id: string;
  departs: RouteStop;
  arrives: RouteStop;
  transitDays: number;
  legs: RouteLeg[];
  cutOffs: { code: string; at: string }[];
}

export interface RouteSearchResult {
  origin: string;
  destination: string;
  routes: RouteOption[];
  fetchedAt: string;
}

const toStop = (
  place: MaerskPlace,
  names: Record<string, string>,
): RouteStop => {
  const code = place.location?.UNLocationCode ?? "";
  const terminal = place.location?.locationName?.trim();
  return {
    code,
    // The port's name from Maersk's port list, else the terminal's
    name: names[code] ?? terminal ?? code,
    ...(terminal && { terminal }),
    at: place.dateTime ?? "",
  };
};

const toLeg = (leg: MaerskLeg, names: Record<string, string>): RouteLeg => {
  const t = leg.transport ?? {};
  const partner = t.servicePartners?.[0];
  const v = t.vessel;
  const named = !!v?.name && !isPlaceholderVessel(v.name, v.callSign);
  const voyage =
    partner?.carrierExportVoyageNumber || partner?.carrierImportVoyageNumber;
  return {
    mode: t.modeOfTransport ?? "VESSEL",
    vessel: named
      ? {
          name: v!.name!.trim(),
          ...(v!.vesselIMONumber && { imo: v!.vesselIMONumber }),
          ...(v!.flag && { flag: v!.flag }),
          ...(v!.callSign && { callSign: v!.callSign }),
        }
      : null,
    ...(partner?.carrierServiceName && { service: partner.carrierServiceName }),
    ...(voyage && { voyage }),
    from: toStop(leg.departure, names),
    to: toStop(leg.arrival, names),
  };
};

// Maersk's routes in the shape the Point to point tab shows. `names` maps
// port codes to names, e.g. MYTPP → "Tanjung Pelepas".
export const toRoutes = (
  raw: MaerskRoute[],
  names: Record<string, string> = {},
): RouteOption[] =>
  raw
    .filter(
      (r) =>
        !isPlaceholderDate(r.placeOfReceipt?.dateTime) &&
        !isPlaceholderDate(r.placeOfDelivery?.dateTime),
    )
    .map((r) => {
      const departs = toStop(r.placeOfReceipt, names);
      const arrives = toStop(r.placeOfDelivery, names);
      return {
        id:
          r.routingReference || `${departs.code}|${arrives.code}|${departs.at}`,
        departs,
        arrives,
        transitDays: r.transitTime ?? 0,
        legs: [...(r.legs ?? [])]
          .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
          .map((leg) => toLeg(leg, names)),
        cutOffs: (r.cutOffTimes ?? [])
          .filter((c) => !isPlaceholderDate(c.cutOffDateTime))
          .map((c) => ({ code: c.cutOffDateTimeCode, at: c.cutOffDateTime })),
      };
    });

// Routes departing on or after `date` for four weeks, or arriving on or
// before it within four weeks (port-local days)
export const routesInWindow = (
  routes: RouteOption[],
  by: RouteDateMode,
  date: string,
) =>
  routes.filter((r) => {
    if (by === "arriving") {
      const day = localDay(r.arrives.at)!;
      return day <= date && day > addDays(date, -ROUTE_WINDOW_DAYS);
    }
    const day = localDay(r.departs.at)!;
    return day >= date && day < addDays(date, ROUTE_WINDOW_DAYS);
  });

const latest = (a: string, b: string) => (a > b ? a : b);
const todayIso = () => new Date().toISOString().slice(0, 10);

// The departures a search needs, and the (wider) range fetched for it. For
// "arriving by", departures are taken from the 56 days before the date
// (never more than a week back): a route with a transit over about four
// weeks that arrives early in the window can fall outside that and be
// missed, which is accepted to keep it to one call.
const routeWindows = (by: RouteDateMode, date: string) => {
  if (by === "arriving") {
    const start = addDays(date, -(ROUTE_FETCH_DAYS - 1));
    return {
      // Sailings that left before today are past booking, so a fetch made
      // for "departing today" can answer this too
      need: { from: latest(start, todayIso()), to: date },
      fetch: {
        from: latest(start, addDays(todayIso(), -ROUTE_PAST_DAYS)),
        to: date,
      },
    };
  }
  return {
    need: { from: date, to: addDays(date, ROUTE_WINDOW_DAYS - 1) },
    fetch: { from: date, to: addDays(date, ROUTE_FETCH_DAYS - 1) },
  };
};

interface RouteFetch {
  from: string;
  to: string;
  routes: RouteOption[];
  fetchedAt: number;
}

// "origin|destination|container" → its recent fetches, newest first
const routeCache = createTtlCache(MAX_CACHE_ENTRIES);

const portNames = (): Record<string, string> =>
  Object.fromEntries(
    (
      portsCache.get<ActivePort[]>("all") ??
      portsStale.get<ActivePort[]>("all") ??
      []
    ).map((p) => [p.code, p.name]),
  );

const fetchRoutes = async (
  origin: string,
  destination: string,
  container: string,
  window: { from: string; to: string },
): Promise<RouteFetch> => {
  const { data } = await request<MaerskRoute[]>(
    "/v1/point-to-point-routes",
    {
      placeOfReceipt: origin,
      placeOfDelivery: destination,
      departureStartDate: window.from,
      departureEndDate: window.to,
      ISOEquipmentCode: container,
      ...(REEFER_CODES.includes(container) && { cargoType: "REEFER" }),
    },
    {
      headers: { "Carrier-Extensions-Version": "1" },
      timeout: ROUTE_TIMEOUT,
    },
  );
  const routes = toRoutes(Array.isArray(data) ? data : [], portNames());

  // Build years come from the Vessels API, in one call for the new IMOs
  const years = await getBuiltYears(
    routes.flatMap((r) =>
      r.legs.flatMap((l) => (l.vessel?.imo ? [l.vessel.imo] : [])),
    ),
  );
  for (const route of routes)
    for (const leg of route.legs)
      if (leg.vessel?.imo && years[leg.vessel.imo])
        leg.vessel.builtYear = years[leg.vessel.imo];

  return { ...window, routes, fetchedAt: Date.now() };
};

// Every route from `origin` to `destination` for a container, departing in
// the four weeks from `date` or arriving in the four weeks up to it. A
// cached fetch that covers the search answers it, so moving the date within
// eight weeks costs no Maersk call.
export const getRoutes = async (
  origin: string,
  destination: string,
  by: RouteDateMode,
  date: string,
  container: string,
): Promise<RouteSearchResult> => {
  const key = `${origin}|${destination}|${container}`;
  const { need, fetch } = routeWindows(by, date);
  const fetches = routeCache.get<RouteFetch[]>(key) ?? [];
  const covering = fetches.filter(
    (f) => f.from <= need.from && f.to >= need.to,
  );
  const fresh = covering.find((f) => Date.now() - f.fetchedAt < SCHEDULE_TTL);

  const source =
    fresh ??
    (await withFallback(async () => {
      const fetched = await fetchRoutes(origin, destination, container, fetch);
      routeCache.set(
        key,
        [
          fetched,
          ...fetches.filter((f) => f.from !== fetch.from || f.to !== fetch.to),
        ].slice(0, 4),
        STALE_TTL,
      );
      return fetched;
    }, covering[0]));

  return {
    origin,
    destination,
    routes: routesInWindow(source.routes, by, date),
    fetchedAt: new Date(source.fetchedAt).toISOString(),
  };
};
