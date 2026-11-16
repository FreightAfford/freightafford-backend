import type { NextFunction, Response } from "express";
import { isValidObjectId } from "mongoose";
import AppError from "../errors/app.error.js";
import Rate from "../models/rate.model.js";
import RateRequest from "../models/rate-request.model.js";
import { sendRateRequestAdminEmail } from "../services/rate-email.service.js";
import { checkImport, commitImport, matchImport } from "../services/rates/import.js";
import { listRatesQuery, listRequestsQuery } from "../services/rates/list.js";
import { resolveRateCommodity, resolveRatePort } from "../services/rates/maersk-refs.js";
import { presentRate, presentRateRequest } from "../services/rates/present.js";
import {
  expiredDates,
  groupRates,
  lagosToday,
  lanesFrom,
  pageOf,
  savedMessage,
} from "../services/rates/rules.js";
import {
  emailAnsweredCustomers,
  resolveAnsweredRequests,
  toRateDoc,
} from "../services/rates/save.js";
import { titleCase } from "../templates/email/layout.js";
import type { AuthenticateRequest } from "../utils/interface.js";
import {
  listQuerySchema,
  queryProblem,
  rateSearchQuerySchema,
  type RateInput,
  type RateRequestInput,
} from "../validations/rate.validation.js";

// Contract rates: FreightAfford's Maersk contract rates, kept by admin.
// Verified customers look a lane up and ask for a rate when there's none.

// Rates valid today (both end days count), as a database filter.
const validToday = () => {
  const today = lagosToday();
  return { validFrom: { $lte: today }, validTo: { $gte: today } };
};

// ---- Customer ------------------------------------------------------------------

// VERIFIED CUSTOMER, ADMIN: rates valid today into a destination, by
// commodity, e.g. /rates/search?destination=BEANR&origin=NGAPP&q=cocoa&page=1
export const searchRates = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const parsed = rateSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) return next(new AppError(queryProblem(parsed.error), 400));
  const { destination, origin, q, page, limit } = parsed.data;

  const rates = await Rate.find({
    "destination.code": destination,
    ...(origin && { "origin.code": origin }),
    ...validToday(),
  }).lean();

  const { groups, totalAll } = groupRates(rates.map(presentRate), q);

  // The caller's open request for the lane, so "Requested on …" survives a
  // reload. Only with an origin: without one there's no single lane.
  const request = origin
    ? await RateRequest.findOne({
        customer: req.user!._id,
        status: "open",
        "origin.code": origin,
        "destination.code": destination,
      })
        .sort({ createdAt: -1 })
        .lean()
    : null;

  res.status(200).json({
    status: "success",
    data: {
      groups: pageOf(groups, page, limit),
      total: groups.length,
      totalAll,
      request: request ? presentRateRequest(request) : null,
    },
  });
};

// VERIFIED CUSTOMER, ADMIN: lanes with a rate valid today, for quick picks.
export const getRateLanes = async (_req: AuthenticateRequest, res: Response) => {
  const rates = await Rate.find(validToday(), {
    origin: 1,
    destination: 1,
    containerSize: 1,
    commodity: 1,
    commodityCode: 1,
    validFrom: 1,
    validTo: 1,
  }).lean();

  const data = lanesFrom(rates as never).sort(
    (a, b) =>
      a.origin.city.localeCompare(b.origin.city) ||
      a.destination.city.localeCompare(b.destination.city),
  );
  res.status(200).json({ status: "success", results: data.length, data });
};

// VERIFIED CUSTOMER: ask for a rate on a lane. Asking again for the same
// lane, commodity and size while the first is open returns that one.
export const requestRate = async (req: AuthenticateRequest, res: Response) => {
  const input = req.body as RateRequestInput;
  const user = req.user!;

  const [origin, destination, commodity] = await Promise.all([
    resolveRatePort(input.origin, "Origin"),
    resolveRatePort(input.destination, "Destination"),
    resolveRateCommodity(input.commodity),
  ]);

  const existing = await RateRequest.findOne({
    customer: user._id,
    status: "open",
    "origin.code": origin.code,
    "destination.code": destination.code,
    "commodity.code": commodity.code,
    containerSize: input.containerSize ?? { $exists: false },
  }).lean();
  if (existing)
    return res.status(200).json({
      status: "success",
      message: "You've already asked for this rate. We'll be in touch.",
      data: presentRateRequest(existing),
    });

  const request = await RateRequest.create({
    origin,
    destination,
    commodity,
    containerSize: input.containerSize,
    note: input.note,
    customer: user._id,
    customerName: titleCase(user.fullname),
    customerCompany: user.companyName ? titleCase(user.companyName) : undefined,
    customerEmail: user.email,
  });

  const { error } = await sendRateRequestAdminEmail(request.toObject());
  // The request is saved; don't fail the customer over an email problem.
  if (error) console.error("[rates] failed to email the new rate request:", error);

  res.status(201).json({
    status: "success",
    message: "Request sent. Our team will get back to you with a rate.",
    data: presentRateRequest(request.toObject()),
  });
};

// ---- Admin: rates ----------------------------------------------------------------

const findRate = async (id: string) => {
  const rate = isValidObjectId(id) ? await Rate.findById(id) : null;
  if (!rate) throw new AppError("This rate no longer exists", 404);
  return rate;
};

// ADMIN: every rate, e.g. /rates?search=apapa&status=active&sort=-updatedAt&page=1
export const listRates = async (req: AuthenticateRequest, res: Response) => {
  const q = listQuerySchema.parse(req.query);
  const [{ data, total }, totalAll] = await Promise.all([
    listRatesQuery(Rate, q),
    Rate.estimatedDocumentCount(),
  ]);
  res.status(200).json({ status: "success", data: data.map(presentRate), total, totalAll });
};

// ADMIN: one rate, for its page.
export const getRate = async (req: AuthenticateRequest, res: Response) => {
  const rate = await findRate(String(req.params.id));
  res.status(200).json({ status: "success", data: presentRate(rate.toObject()) });
};

// ADMIN: add a rate. Open requests it answers are resolved and their
// customers emailed.
export const createRate = async (req: AuthenticateRequest, res: Response) => {
  const doc = await toRateDoc(req.body as RateInput, req.user!);
  const rate = await Rate.create({ ...doc, createdBy: req.user!._id });

  const resolved = await resolveAnsweredRequests([rate.toObject()], req.user!);
  await emailAnsweredCustomers(resolved);

  res.status(201).json({
    status: "success",
    message: savedMessage("added", resolved.length),
    data: presentRate(rate.toObject()),
  });
};

// ADMIN: change a rate. Like adding one, it can answer open requests.
export const updateRate = async (req: AuthenticateRequest, res: Response) => {
  const rate = await findRate(String(req.params.id));
  const doc = await toRateDoc(req.body as RateInput, req.user!);
  // Optional fields left empty are cleared, not kept.
  for (const field of ["commodityCode", "serviceMode", "transitHours", "remarks"] as const)
    rate.set(field, doc[field] ?? undefined);
  rate.set(doc);
  await rate.save();

  const resolved = await resolveAnsweredRequests([rate.toObject()], req.user!);
  await emailAnsweredCustomers(resolved);

  res.status(200).json({
    status: "success",
    message: savedMessage("updated", resolved.length),
    data: presentRate(rate.toObject()),
  });
};

// ADMIN: end a rate yesterday, so customers stop seeing it at once.
export const expireRate = async (req: AuthenticateRequest, res: Response) => {
  const rate = await findRate(String(req.params.id));
  rate.set({
    ...expiredDates(rate, lagosToday()),
    updatedBy: req.user!._id,
    updatedByName: req.user!.fullname,
  });
  await rate.save();
  res.status(200).json({ status: "success", message: "Rate expired", data: presentRate(rate.toObject()) });
};

// ADMIN: remove a rate for good.
export const deleteRate = async (req: AuthenticateRequest, res: Response) => {
  const rate = await findRate(String(req.params.id));
  await rate.deleteOne();
  res.status(200).json({ status: "success", message: "Rate deleted" });
};

// ---- Admin: import -----------------------------------------------------------------

// ADMIN: what the file's ports and commodities match.
export const matchRateImport = async (req: AuthenticateRequest, res: Response) => {
  const data = await matchImport(req.body);
  res.status(200).json({ status: "success", data });
};

// ADMIN: how each rate sits against the saved ones (replaces, overlaps,
// problems), in the order sent.
export const checkRateImport = async (req: AuthenticateRequest, res: Response) => {
  const data = await checkImport(req.body.rates, req.user!);
  res.status(200).json({ status: "success", data });
};

// ADMIN: save the rates, all or nothing.
export const commitRateImport = async (req: AuthenticateRequest, res: Response) => {
  const result = await commitImport(req.body, req.user!);
  res.status(200).json({ status: "success", ...result });
};

// ---- Admin: rate requests ----------------------------------------------------------

// ADMIN: customers' rate requests, e.g. /rates/requests?status=open&sort=-createdAt
export const listRateRequests = async (req: AuthenticateRequest, res: Response) => {
  const q = listQuerySchema.parse(req.query);
  const [{ data, total }, totalAll, open] = await Promise.all([
    listRequestsQuery(RateRequest, q),
    RateRequest.estimatedDocumentCount(),
    RateRequest.countDocuments({ status: "open" }),
  ]);
  res.status(200).json({
    status: "success",
    data: data.map(presentRateRequest),
    total,
    totalAll,
    open,
  });
};

// ADMIN: close a request by hand (no rate, so no email).
export const resolveRateRequest = async (req: AuthenticateRequest, res: Response) => {
  const id = String(req.params.id);
  const request = isValidObjectId(id) ? await RateRequest.findById(id) : null;
  if (!request) throw new AppError("This request no longer exists", 404);

  if (request.status === "open") {
    request.set({ status: "resolved", resolvedAt: new Date(), resolvedBy: req.user!._id });
    await request.save();
  }
  res.status(200).json({
    status: "success",
    message: "Request marked as resolved",
    data: presentRateRequest(request.toObject()),
  });
};
