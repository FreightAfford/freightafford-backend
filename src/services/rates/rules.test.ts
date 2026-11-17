import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IRateCharge } from "../../utils/interface.js";
import {
  addDays,
  commodityRefKey,
  answersRequest,
  escapeRegex,
  expiredDates,
  findOverlaps,
  findReplaced,
  groupRates,
  importMessage,
  isValidOn,
  lagosToday,
  lanesFrom,
  matchAnswered,
  overlaps,
  pageOf,
  rateAccess,
  portKey,
  rateStatus,
  sameCommodity,
  savedMessage,
  statusFilter,
  type RateLike,
  type RequestLike,
  type RateStatus,
} from "./rules.js";

const TODAY = "2026-11-15";
const APAPA = { code: "NGAPP", city: "Apapa", country: "Nigeria" };
const TINCAN = { code: "NGTIN", city: "Tin Can Island", country: "Nigeria" };
const ANTWERP = { code: "BEANR", city: "Antwerp", country: "Belgium" };
const VALENCIA = { code: "ESVLC", city: "Valencia", country: "Spain" };

const charge = (code: string, amount: number, currency = "USD"): IRateCharge => ({
  code,
  name: code,
  amount,
  currency,
  basis: "container",
  stage: "freight",
  payTerm: "either",
  structure: "fixed",
});

const rate = (over: Partial<RateLike> = {}): RateLike => ({
  origin: APAPA,
  destination: ANTWERP,
  containerSize: "40ft HC",
  validFrom: "2026-11-01",
  validTo: "2026-11-30",
  commodity: "Cocoa beans",
  charges: [charge("BAS", 1300)],
  updatedAt: "2026-11-01T10:00:00Z",
  ...over,
});

describe("dates", () => {
  it("uses the Lagos day, not the server's", () => {
    // 23:30 UTC on 15 Nov is already 00:30 on 16 Nov in Lagos (UTC+1)
    assert.equal(lagosToday(new Date("2026-11-15T23:30:00Z")), "2026-11-16");
    assert.equal(lagosToday(new Date("2026-11-15T22:59:00Z")), "2026-11-15");
  });

  it("adds days across months and years", () => {
    assert.equal(addDays("2026-11-30", 1), "2026-12-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("counts both end days as valid", () => {
    assert.ok(isValidOn(rate(), "2026-11-01"));
    assert.ok(isValidOn(rate(), "2026-11-30"));
    assert.ok(!isValidOn(rate(), "2026-12-01"));
  });

  it("works out status from the dates", () => {
    assert.equal(rateStatus(rate({ validFrom: "2026-12-01", validTo: "2026-12-31" }), TODAY), "scheduled");
    assert.equal(rateStatus(rate({ validTo: "2026-11-14" }), TODAY), "expired");
    assert.equal(rateStatus(rate({ validTo: "2026-11-15" }), TODAY), "expiring"); // ends today
    assert.equal(rateStatus(rate({ validTo: "2026-11-22" }), TODAY), "expiring"); // 7 days left
    assert.equal(rateStatus(rate({ validTo: "2026-11-23" }), TODAY), "active");
  });

  it("filters the database the same way as the status", () => {
    const ends = ["2026-11-14", "2026-11-15", "2026-11-22", "2026-11-23", "2026-12-31"];
    const starts = ["2026-11-01", "2026-11-15", "2026-11-16"];
    // A tiny evaluator for the $gt/$gte/$lt/$lte filters statusFilter builds
    const matches = (doc: Record<string, string>, filter: Record<string, Record<string, string>>) =>
      Object.entries(filter).every(([field, ops]) =>
        Object.entries(ops).every(([op, value]) =>
          op === "$gt" ? doc[field] > value
            : op === "$gte" ? doc[field] >= value
              : op === "$lt" ? doc[field] < value
                : doc[field] <= value,
        ),
      );
    for (const validFrom of starts)
      for (const validTo of ends) {
        if (validTo < validFrom) continue;
        const doc = { validFrom, validTo };
        const status = rateStatus(doc, TODAY);
        for (const s of ["scheduled", "active", "expiring", "expired"] as RateStatus[])
          assert.equal(
            matches(doc, statusFilter(s, TODAY) as never),
            s === status,
            `${validFrom}..${validTo} is ${status}, filter ${s}`,
          );
      }
  });

  it("expires a rate yesterday, pulling its start back if needed", () => {
    assert.deepEqual(expiredDates(rate(), TODAY), { validFrom: "2026-11-01", validTo: "2026-11-14" });
    assert.deepEqual(
      expiredDates(rate({ validFrom: "2026-12-01", validTo: "2026-12-31" }), TODAY),
      { validFrom: "2026-11-14", validTo: "2026-11-14" },
    );
  });
});

describe("who can use rates", () => {
  it("lets staff in, whatever else is true", () => {
    assert.equal(rateAccess({ role: "admin" }, false), "allowed");
    assert.equal(rateAccess({ role: "admin", customerTier: "premium" }, false), "allowed");
  });

  it("lets verified commission customers in, counting old accounts as commission", () => {
    assert.equal(rateAccess({ role: "customer", customerTier: "commission" }, true), "allowed");
    assert.equal(rateAccess({ role: "customer" }, true), "allowed");
    assert.equal(rateAccess({ role: "customer", customerTier: null }, true), "allowed");
  });

  it("keeps premium customers out even when verified, before asking for verification", () => {
    assert.equal(rateAccess({ role: "customer", customerTier: "premium" }, true), "premium");
    assert.equal(rateAccess({ role: "customer", customerTier: "premium" }, false), "premium");
    assert.equal(rateAccess({ role: "customer", customerTier: "commission" }, false), "unverified");
  });
});

describe("which rate is which", () => {
  it("compares commodities by Maersk code when both have one, else by name", () => {
    assert.ok(sameCommodity({ commodity: "Iron ore", commodityCode: "002701" }, { commodity: "IRON ORE (fines)", commodityCode: "002701" }));
    assert.ok(!sameCommodity({ commodity: "Iron ore", commodityCode: "002701" }, { commodity: "Iron ore", commodityCode: "002702" }));
    assert.ok(sameCommodity({ commodity: "Cocoa  beans" }, { commodity: "cocoa beans", commodityCode: "001801" }));
  });

  it("finds the saved rate a new one replaces: same slot and start date", () => {
    const saved = [
      rate({ _id: "a" }),
      rate({ _id: "b", containerSize: "20ft Std" }),
      rate({ _id: "c", validFrom: "2026-12-01", validTo: "2026-12-31" }),
    ];
    assert.equal(findReplaced(saved, rate({ validTo: "2026-12-15" }))?._id, "a");
    assert.equal(findReplaced(saved, rate({ validFrom: "2026-11-02" })), null);
    assert.equal(findReplaced(saved, rate({ destination: VALENCIA })), null);
  });

  it("lists overlapping saved rates other than the replaced one", () => {
    const a = rate({ _id: "a" });
    const c = rate({ _id: "c", validFrom: "2026-11-20", validTo: "2026-12-20" });
    const d = rate({ _id: "d", validFrom: "2026-12-01", validTo: "2026-12-31" });
    const input = rate({ validTo: "2026-11-25" });
    assert.deepEqual(findOverlaps([a, c, d], input, a).map((r) => r._id), ["c"]);
    assert.ok(overlaps(a, c) && !overlaps(a, d));
  });
});

describe("rate requests", () => {
  const request = (over: Partial<RequestLike> = {}): RequestLike => ({
    origin: APAPA,
    destination: ANTWERP,
    commodity: { code: "001801", name: "Cocoa beans" },
    status: "open",
    ...over,
  });

  it("is answered by a rate for its lane and commodity, its size or any size", () => {
    assert.ok(answersRequest(rate(), request()));
    assert.ok(answersRequest(rate(), request({ containerSize: "40ft HC" })));
    assert.ok(answersRequest(rate({ commodityCode: "001801", commodity: "Cocoa beans, raw" }), request()));
  });

  it("isn't answered by another size, lane or commodity, or when resolved", () => {
    assert.ok(!answersRequest(rate(), request({ containerSize: "20ft Std" })));
    assert.ok(!answersRequest(rate({ origin: TINCAN }), request()));
    assert.ok(!answersRequest(rate({ commodity: "Cashew nuts" }), request()));
    assert.ok(!answersRequest(rate({ commodityCode: "080131" }), request()));
    assert.ok(!answersRequest(rate(), request({ status: "resolved" })));
  });

  it("matches each request to the rate starting soonest, never an expired one", () => {
    const now = rate({ _id: "now" });
    const december = rate({ _id: "dec", validFrom: "2026-12-01", validTo: "2026-12-31" });
    const old = rate({ _id: "old", validFrom: "2026-10-01", validTo: "2026-10-31" });
    const any = request();
    const twenty = request({ containerSize: "20ft Std" });
    const matched = matchAnswered([december, now, old], [any, twenty], TODAY);
    assert.deepEqual(matched.map((m) => [m.request, m.rate._id]), [[any, "now"]]);
    assert.deepEqual(matchAnswered([december], [any], TODAY).map((m) => m.rate._id), ["dec"]);
    assert.deepEqual(matchAnswered([old], [any], TODAY), []);
  });
});

describe("customer search", () => {
  it("groups by lane and commodity, one rate per size, the latest save winning", () => {
    const { groups, totalAll } = groupRates([
      rate({ _id: "old", charges: [charge("BAS", 1300)], updatedAt: "2026-11-01T10:00:00Z" }),
      rate({ _id: "new", charges: [charge("BAS", 1250)], updatedAt: "2026-11-10T10:00:00Z" }),
      rate({ _id: "20", containerSize: "20ft Std", charges: [charge("BAS", 990)], validTo: "2026-11-20" }),
      rate({ _id: "cashew", commodity: "Cashew nuts" }),
      rate({ _id: "tc", origin: TINCAN }),
    ]);
    assert.equal(totalAll, 3);
    const cocoa = groups.find((g) => g.origin.code === "NGAPP" && g.commodity === "Cocoa beans")!;
    assert.deepEqual(cocoa.rates.map((r) => r._id), ["20", "new"]); // size order
    assert.deepEqual(cocoa.fromBasic, { amount: 990, currency: "USD" });
    assert.equal(cocoa.validTo, "2026-11-20");
    assert.equal(cocoa.key, "NGAPP|BEANR|Cocoa beans");
  });

  it("sorts by origin then commodity and filters by every word", () => {
    const all = [rate({ commodity: "Cashew nuts" }), rate({ commodity: "Cocoa beans" }), rate({ origin: TINCAN, commodity: "Cocoa butter" })];
    assert.deepEqual(groupRates(all).groups.map((g) => g.commodity), ["Cashew nuts", "Cocoa beans", "Cocoa butter"]);
    // "nuts" must not match by the letter s (the sample data split on /s+/)
    assert.deepEqual(groupRates(all, "cashew nuts").groups.map((g) => g.commodity), ["Cashew nuts"]);
    assert.deepEqual(groupRates(all, "COCOA").groups.length, 2);
    assert.equal(groupRates(all, "cocoa").totalAll, 3);
  });

  it("lists lanes with their sizes in order and how many commodities", () => {
    const lanes = lanesFrom([
      rate({ containerSize: "40ft HC" }),
      rate({ containerSize: "20ft Std", commodity: "cocoa beans" }),
      rate({ containerSize: "20ft Std", commodity: "Cashew nuts" }),
      rate({ origin: TINCAN }),
    ]);
    assert.equal(lanes.length, 2);
    const apapa = lanes.find((l) => l.origin.code === "NGAPP")!;
    assert.deepEqual(apapa.sizes, ["20ft Std", "40ft HC"]);
    assert.equal(apapa.commodities, 2);
  });
});

describe("paging and messages", () => {
  it("pages from 1", () => {
    assert.deepEqual(pageOf([1, 2, 3, 4, 5], 2, 2), [3, 4]);
    assert.deepEqual(pageOf([1, 2, 3], 3, 2), []);
  });

  it("says how many requests a save resolved", () => {
    assert.equal(savedMessage("added", 0), "Rate added");
    assert.equal(savedMessage("updated", 1), "Rate updated. 1 rate request resolved.");
    assert.equal(importMessage(90, 6, 2), "Import done: 90 added, 6 replaced, 2 rate requests resolved.");
    assert.equal(importMessage(0, 0, 0), "Import done: nothing to import.");
  });

  it("keys import names the way the frontend does", () => {
    assert.equal(portKey("  Apapa,   Nigeria "), "apapa, nigeria");
    assert.equal(commodityRefKey({ kind: "maersk", code: " mine_iro_ore_oth_met" }), "maersk:MINE_IRO_ORE_OTH_MET");
    // Words keep their s: the frontend once split on the letter s
    assert.equal(commodityRefKey({ kind: "text", text: " Glass  Bottles " }), "text:glass bottles");
  });

  it("escapes search text for a regular expression", () => {
    assert.equal(escapeRegex("40ft (HC)+"), "40ft \\(HC\\)\\+");
    assert.ok(new RegExp(escapeRegex("a.b*")).test("a.b*"));
  });
});
