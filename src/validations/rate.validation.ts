import { z } from "zod";
import { RATE_CONTAINER_SIZES } from "../utils/interface.js";

// Contract rate rules. The rate input mirrors the frontend's rate form
// (frontend/src/validations/rateValidation.ts, after formToRateInput), so
// admin sees the same messages, but the server is the one that decides.

const UN_LOCODE = /^[A-Z]{2}[A-Z2-9]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar day, e.g. not 2026-02-30.
const isoDate = (message: string) =>
  z
    .string(message)
    .regex(ISO_DATE, message)
    .refine((d) => {
      const date = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d);
    }, message);

// Picked from the Maersk port search.
export const ratePortSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(UN_LOCODE, "Choose a port from the search results"),
  city: z.string().trim().min(1, "Add the city").max(100),
  country: z.string().trim().min(1, "Add the country").max(100),
});

// Picked from the Maersk commodity search.
export const rateCommoditySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Choose a commodity from the search results"),
  name: z.string().trim().min(2, "Choose a commodity from the search results").max(200),
});

const containerSize = z.enum(RATE_CONTAINER_SIZES, "Choose a container size");

const currency = z.string("Choose a currency").trim().toUpperCase().regex(/^[A-Z]{3}$/, "Choose a currency");

const amount = z
  .number("Add an amount")
  .min(0, "Amount can't be negative")
  .max(10_000_000, "That amount looks too large");

const chargeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Add a code")
    .max(6, "Codes are up to 6 characters")
    .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only")
    .toUpperCase(),
  name: z.string().trim().min(2, "Add the charge name").max(80, "Too long"),
  amount,
  currency,
  basis: z.enum(["container", "document"]),
  stage: z.enum(["freight", "origin", "destination"]),
  payTerm: z.enum(["prepaid", "collect", "either"]),
  structure: z.enum(["fixed", "floating"]),
});

const wholeDay = (message: string) => z.number(message).int("Whole days only").min(1, "Day 1 or later");

const tierSchema = z
  .object({
    fromDay: wholeDay("Add the first day"),
    toDay: wholeDay("Add the last day").optional(), // none: open-ended
    amount,
    currency,
  })
  .refine((t) => t.toDay === undefined || t.toDay >= t.fromDay, {
    message: "Ends before it starts",
    path: ["toDay"],
  });

const freeTimeSchema = z.object({
  type: z.string().trim().min(2, "Add the type").max(60),
  days: z.number("Add the free days").int("Whole days only").min(0, "Can't be negative").max(365),
  dayType: z.string().trim().min(2, "Add the day type").max(60),
  startEvent: z.string().trim().min(2, "Add when it starts").max(60),
  endEvent: z.string().trim().min(2, "Add when it ends").max(60),
  note: z.string().trim().max(200, "Too long").optional(),
  tiers: z.array(tierSchema).max(20),
});

// Empty text means "not given".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .optional()
    .transform((t) => t || undefined);

export const rateInputSchema = z
  .object({
    origin: ratePortSchema,
    destination: ratePortSchema,
    containerSize,
    validFrom: isoDate("Choose the first day"),
    validTo: isoDate("Choose the last day"),
    commodity: z.string().trim().min(2, "Choose a commodity").max(200),
    // A rate saved before it had a Maersk code has none.
    commodityCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Choose a commodity from the search results")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    serviceMode: optionalText(20),
    transitHours: z.number().int().min(0).max(24 * 365).optional(),
    remarks: optionalText(500),
    charges: z.array(chargeSchema).min(1, "Add at least one charge").max(60),
    freeTime: z.array(freeTimeSchema).max(10).default([]),
  })
  .refine((d) => d.origin.code !== d.destination.code, {
    message: "Origin and destination must be different ports",
    path: ["destination"],
  })
  .refine((d) => d.validTo >= d.validFrom, {
    message: "Ends before it starts",
    path: ["validTo"],
  });

export type RateInput = z.output<typeof rateInputSchema>;

// A customer asking for a rate on a lane.
export const rateRequestInputSchema = z
  .object({
    origin: ratePortSchema,
    destination: ratePortSchema,
    commodity: rateCommoditySchema,
    containerSize: containerSize.optional(), // none: any size
    note: optionalText(500),
  })
  .refine((d) => d.origin.code !== d.destination.code, {
    message: "Choose two different ports",
    path: ["destination"],
  });

export type RateRequestInput = z.output<typeof rateRequestInputSchema>;

// ---- Query strings -----------------------------------------------------------

const page = z.coerce.number().int().min(1).catch(1);
const limit = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).catch(fallback);

const queryPort = (message: string) =>
  z.string(message).trim().toUpperCase().regex(UN_LOCODE, message);

// GET /rates/search?destination=BEANR&origin=NGAPP&q=cocoa&page=1&limit=10
export const rateSearchQuerySchema = z.object({
  destination: queryPort("Choose a destination port"),
  origin: z
    .union([queryPort("Choose an origin port from the list"), z.literal("")])
    .optional()
    .transform((o) => o || undefined),
  q: z.string().trim().max(100).catch(""),
  page,
  limit: limit(50, 10),
});

// Admin lists: GET /rates and GET /rates/requests.
export const listQuerySchema = z.object({
  page,
  limit: limit(100, 10),
  search: z.string().trim().max(100).catch(""),
  sort: z.string().trim().max(40).optional().catch(undefined),
  status: z.string().trim().max(20).optional().catch(undefined),
  containerSize: containerSize.optional().catch(undefined),
});

/** The first problem with a query string, for a 400 message. */
export const queryProblem = (error: z.ZodError) => error.issues[0]?.message ?? "Check the search";
