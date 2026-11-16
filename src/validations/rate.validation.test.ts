import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listQuerySchema,
  rateInputSchema,
  rateRequestInputSchema,
  rateSearchQuerySchema,
} from "./rate.validation.js";

const APAPA = { code: "NGAPP", city: "Apapa", country: "Nigeria" };
const ANTWERP = { code: "BEANR", city: "Antwerp", country: "Belgium" };

// A rate as the frontend's formToRateInput sends it.
const input = (over: Record<string, unknown> = {}) => ({
  origin: APAPA,
  destination: ANTWERP,
  containerSize: "40ft HC",
  validFrom: "2026-11-01",
  validTo: "2026-11-30",
  commodity: "Cocoa beans",
  commodityCode: "001801",
  serviceMode: "CY/CY",
  transitHours: 1550,
  charges: [
    {
      code: "bas",
      name: "Basic Ocean Freight",
      amount: 1300,
      currency: "USD",
      basis: "container",
      stage: "freight",
      payTerm: "either",
      structure: "fixed",
    },
  ],
  freeTime: [
    {
      type: "Combined",
      days: 14,
      dayType: "Calendar days",
      startEvent: "Discharge",
      endEvent: "Gate-in empty",
      tiers: [{ fromDay: 15, toDay: 17, amount: 120, currency: "USD" }, { fromDay: 18, amount: 200, currency: "USD" }],
    },
  ],
  ...over,
});

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe("rate input", () => {
  it("accepts what the rate form sends, upper-casing charge codes", () => {
    const result = rateInputSchema.safeParse(input());
    assert.ok(result.success, JSON.stringify(result.error?.issues));
    assert.equal(result.data.charges[0].code, "BAS");
  });

  it("treats empty optional text and an empty code as not given", () => {
    const result = rateInputSchema.parse(input({ commodityCode: "", serviceMode: "", remarks: "  " }));
    assert.equal(result.commodityCode, undefined);
    assert.equal(result.serviceMode, undefined);
    assert.equal(result.remarks, undefined);
  });

  it("refuses the same port twice, dates out of order and impossible dates", () => {
    assert.ok(messages(rateInputSchema.safeParse(input({ destination: APAPA }))).includes("Origin and destination must be different ports"));
    assert.ok(messages(rateInputSchema.safeParse(input({ validTo: "2026-10-31" }))).includes("Ends before it starts"));
    assert.ok(!rateInputSchema.safeParse(input({ validTo: "2026-11-31" })).success);
    assert.ok(!rateInputSchema.safeParse(input({ validFrom: "01/11/2026" })).success);
  });

  it("refuses a rate with no charges, a bad currency or a negative amount", () => {
    assert.ok(messages(rateInputSchema.safeParse(input({ charges: [] }))).includes("Add at least one charge"));
    const charge = input().charges[0];
    assert.ok(!rateInputSchema.safeParse(input({ charges: [{ ...charge, currency: "US" }] })).success);
    assert.ok(!rateInputSchema.safeParse(input({ charges: [{ ...charge, amount: -1 }] })).success);
  });

  it("refuses a free time step that ends before it starts, and unknown sizes", () => {
    const freeTime = input().freeTime;
    freeTime[0].tiers = [{ fromDay: 15, toDay: 10, amount: 1, currency: "USD" }];
    assert.ok(messages(rateInputSchema.safeParse(input({ freeTime }))).includes("Ends before it starts"));
    assert.ok(!rateInputSchema.safeParse(input({ containerSize: "20ft Reefer" })).success);
  });
});

describe("rate request input", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    origin: APAPA,
    destination: ANTWERP,
    commodity: { code: "001801", name: "Cocoa beans" },
    ...over,
  });

  it("accepts any size (none given) and trims the note", () => {
    const result = rateRequestInputSchema.parse(request({ note: "  Weekly, 4 boxes  " }));
    assert.equal(result.containerSize, undefined);
    assert.equal(result.note, "Weekly, 4 boxes");
  });

  it("needs a Maersk commodity code, different ports and a short note", () => {
    assert.ok(!rateRequestInputSchema.safeParse(request({ commodity: { code: "", name: "Cocoa" } })).success);
    assert.ok(!rateRequestInputSchema.safeParse(request({ destination: APAPA })).success);
    assert.ok(!rateRequestInputSchema.safeParse(request({ note: "x".repeat(501) })).success);
  });
});

describe("query strings", () => {
  it("needs a destination port and upper-cases codes", () => {
    const result = rateSearchQuerySchema.parse({ destination: "beanr", origin: "ngapp", page: "2", limit: "5" });
    assert.deepEqual(result, { destination: "BEANR", origin: "NGAPP", q: "", page: 2, limit: 5 });
    assert.ok(!rateSearchQuerySchema.safeParse({}).success);
    assert.ok(!rateSearchQuerySchema.safeParse({ destination: "Antwerp" }).success);
  });

  it("falls back to sensible paging instead of failing", () => {
    const result = rateSearchQuerySchema.parse({ destination: "BEANR", origin: "", page: "-3", limit: "5000" });
    assert.equal(result.origin, undefined);
    assert.equal(result.page, 1);
    assert.equal(result.limit, 10);
    assert.equal(listQuerySchema.parse({ limit: "100" }).limit, 100);
  });
});
