import mongoose from "mongoose";
import AppError from "../../errors/app.error.js";
import { getCommodityByCode, searchCommodities } from "../../integrations/maersk/commodities.client.js";
import { getLocationByCode, searchLocations } from "../../integrations/maersk/locations.client.js";
import ImportMapping from "../../models/import-mapping.model.js";
import Rate from "../../models/rate.model.js";
import type { IRate, IRatePort, IUser } from "../../utils/interface.js";
import {
  rateInputSchema,
  type ImportCommodityRef,
  type ImportMappingsInput,
  type ImportPortRef,
} from "../../validations/rate.validation.js";
import {
  commodityRefKey,
  findOverlaps,
  findReplaced,
  importMessage,
  portKey,
  sameSlot,
  type RateLike,
} from "./rules.js";
import { emailAnsweredCustomers, resolveAnsweredRequests, toRateDoc } from "./save.js";

// Bulk import. The browser reads the file and sends JSON in three steps:
// match its port and commodity names, check its rates, then save them, all
// or nothing. Maersk lookups are cached, so repeated names cost nothing.

type Commodity = { code: string; name: string };
type Match<T> = { match: T | null; suggestions: T[] };
const NO_MATCH = { match: null, suggestions: [] };

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const toPort = (p: IRatePort): IRatePort => ({ code: p.code, city: p.city, country: p.country });
const toCommodity = (c: Commodity): Commodity => ({ code: c.code, name: c.name });

// ---- 1. Match -----------------------------------------------------------------

const matchPort = async (ref: ImportPortRef): Promise<Match<IRatePort>> => {
  if (ref.code) {
    const found = await getLocationByCode(ref.code);
    return { match: found ? toPort(found) : null, suggestions: [] };
  }
  // The port search takes letters only
  const query = (ref.city ?? "").replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2) return NO_MATCH;

  const found = await searchLocations(query.slice(0, 60));
  const exact = found.filter(
    (p) => norm(p.city) === norm(ref.city!) && (!ref.country || norm(p.country) === norm(ref.country)),
  );
  const pick = exact.find((p) => p.maerskServed) ?? exact[0];
  return { match: pick ? toPort(pick) : null, suggestions: found.slice(0, 6).map(toPort) };
};

const matchCommodity = async (ref: ImportCommodityRef): Promise<Match<Commodity>> => {
  // Maersk's quote codes (MINE_IRO_ORE_OTH_MET) aren't in the commodity
  // search: admin picks once and it's remembered.
  if (ref.kind === "maersk") return NO_MATCH;
  const text = ref.text.trim();
  if (/^\d{6}$/.test(text)) {
    const found = await getCommodityByCode(text);
    return { match: found ? toCommodity(found) : null, suggestions: [] };
  }
  if (text.length < 2) return NO_MATCH;

  const found = await searchCommodities(text.slice(0, 60));
  const pick = found.find((c) => norm(c.name) === norm(text));
  return { match: pick ? toCommodity(pick) : null, suggestions: found.slice(0, 6).map(toCommodity) };
};

/**
 * What each name matched: admin's earlier choice first, else the Maersk
 * lookups. A failed lookup leaves the name for admin to pick.
 */
export const matchImport = async (body: { ports: ImportPortRef[]; commodities: ImportCommodityRef[] }) => {
  const remembered = await ImportMapping.find({
    $or: [
      { kind: "port", key: { $in: body.ports.map((p) => portKey(p.raw)) } },
      { kind: "commodity", key: { $in: body.commodities.map(commodityRefKey) } },
    ],
  }).lean();
  const choice = (kind: string, key: string) => remembered.find((m) => m.kind === kind && m.key === key);

  const ports: Record<string, Match<IRatePort>> = {};
  for (const ref of body.ports) {
    const chosen = choice("port", portKey(ref.raw))?.port;
    ports[ref.raw] = chosen
      ? { match: toPort(chosen), suggestions: [] }
      : await matchPort(ref).catch(() => NO_MATCH);
  }

  const commodities: Record<string, Match<Commodity>> = {};
  for (const ref of body.commodities) {
    const key = commodityRefKey(ref);
    const chosen = choice("commodity", key)?.commodity;
    commodities[key] = chosen
      ? { match: toCommodity(chosen), suggestions: [] }
      : await matchCommodity(ref).catch(() => NO_MATCH);
  }

  return { ports, commodities };
};

// ---- 2. Check --------------------------------------------------------------------

type Doc = Awaited<ReturnType<typeof toRateDoc>>;

/**
 * A rate checked as the rate form's save checks it: its problems, or the
 * document to save. A Maersk outage isn't the rate's problem, so it's thrown.
 */
const prepare = async (raw: unknown, user: IUser): Promise<{ doc?: Doc; problems: string[] }> => {
  const parsed = rateInputSchema.safeParse(raw);
  if (!parsed.success)
    return {
      problems: parsed.error.issues.map((i) => {
        const field = i.path.filter((p) => typeof p === "string").join(" ");
        return field ? `${field}: ${i.message}` : i.message;
      }),
    };
  try {
    return { doc: await toRateDoc(parsed.data, user), problems: [] };
  } catch (error) {
    // An unknown port or commodity
    if (error instanceof AppError && error.statusCode === 400) return { problems: [error.message] };
    throw error;
  }
};

type SavedRate = IRate & RateLike & { _id: mongoose.Types.ObjectId };

// Saved rates on the same lanes and sizes: the only ones these can replace
// or overlap.
const savedRatesLike = async (docs: Doc[]): Promise<SavedRate[]> =>
  docs.length
    ? ((await Rate.find({
        $or: docs.map((d) => ({
          "origin.code": d.origin.code,
          "destination.code": d.destination.code,
          containerSize: d.containerSize,
        })),
      }).lean()) as unknown as SavedRate[])
    : [];

/** How each rate sits against the saved ones, and what would stop it. */
export const checkImport = async (rates: unknown[], user: IUser) => {
  const prepared = [];
  for (const raw of rates) prepared.push(await prepare(raw, user));
  const saved = await savedRatesLike(prepared.flatMap((p) => (p.doc ? [p.doc] : [])));

  return prepared.map(({ doc, problems }) => {
    if (!doc) return { replaces: null, overlaps: [], problems };
    const replaced = findReplaced(saved, doc);
    return {
      replaces: replaced ? String(replaced._id) : null,
      overlaps: findOverlaps(saved, doc, replaced).map((r) => ({
        _id: String(r._id),
        validFrom: r.validFrom,
        validTo: r.validTo,
      })),
      problems: [],
    };
  });
};

// ---- 3. Save -----------------------------------------------------------------------

/**
 * Saves every rate or none. Each is checked again, and what it replaces is
 * worked out here (the browser's guess is ignored). The rates, the requests
 * they answer and admin's name choices are saved in one transaction;
 * customers are emailed once it's committed.
 */
export const commitImport = async (
  body: { rates: { rate: unknown }[]; mappings: ImportMappingsInput },
  user: IUser,
) => {
  const docs: Doc[] = [];
  for (const [i, { rate }] of body.rates.entries()) {
    const { doc, problems } = await prepare(rate, user);
    if (!doc) throw new AppError(`Rate ${i + 1} can't be saved: ${problems.join("; ")}`, 400);
    const twin = docs.findIndex((d) => sameSlot(d, doc) && d.validFrom === doc.validFrom);
    if (twin >= 0)
      throw new AppError(`Rates ${twin + 1} and ${i + 1} are for the same lane, size, commodity and start date`, 400);
    docs.push(doc);
  }

  const saved = await savedRatesLike(docs);
  const toReplace: { doc: Doc; old: SavedRate }[] = [];
  const toCreate: Doc[] = [];
  for (const doc of docs) {
    const old = findReplaced(saved, doc);
    if (old) toReplace.push({ doc, old });
    else toCreate.push(doc);
  }

  let resolved: Awaited<ReturnType<typeof resolveAnsweredRequests>> = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // The new rate takes the old one's place whole, keeping its id and
      // when and by whom it was first added.
      if (toReplace.length)
        await Rate.bulkWrite(
          toReplace.map(({ doc, old }) => ({
            replaceOne: {
              filter: { _id: old._id },
              replacement: { ...doc, createdBy: old.createdBy, createdAt: old.createdAt },
            },
          })) as never,
          { session },
        );
      const created = await Rate.insertMany(
        toCreate.map((doc) => ({ ...doc, createdBy: user._id })),
        { session },
      );

      const savedNow = [
        ...toReplace.map(({ doc, old }) => ({ ...doc, _id: old._id })),
        ...created.map((r) => r.toObject()),
      ];
      resolved = await resolveAnsweredRequests(savedNow, user, session);
      await saveChoices(body.mappings, user, session);
    });
  } finally {
    await session.endSession();
  }

  await emailAnsweredCustomers(resolved);

  return {
    message: importMessage(toCreate.length, toReplace.length, resolved.length),
    created: toCreate.length,
    replaced: toReplace.length,
    resolvedRequests: resolved.length,
  };
};

// Admin's picks for names that didn't match, for the next import. Keys are
// written the way matchImport looks them up.
const saveChoices = async (mappings: ImportMappingsInput, user: IUser, session: mongoose.ClientSession) => {
  const upsert = (kind: string, key: string, value: object) => ({
    updateOne: {
      filter: { kind, key },
      update: { $set: { ...value, updatedBy: user._id } },
      upsert: true,
    },
  });
  const ops = [
    ...Object.entries(mappings.ports).map(([raw, port]) => upsert("port", portKey(raw), { port })),
    ...Object.entries(mappings.commodities).map(([key, commodity]) =>
      upsert(
        "commodity",
        key.startsWith("maersk:")
          ? commodityRefKey({ kind: "maersk", code: key.slice(7) })
          : commodityRefKey({ kind: "text", text: key.slice(5) }),
        { commodity },
      ),
    ),
  ];
  if (ops.length) await ImportMapping.bulkWrite(ops as never, { session });
};
