import type { NextFunction, Response } from "express";
import AppError from "../errors/app.error.js";
import Rate from "../models/rate.model.js";
import RateRequest from "../models/rate-request.model.js";
import { sendRateRequestAdminEmail } from "../services/rate-email.service.js";
import { resolveRateCommodity, resolveRatePort } from "../services/rates/maersk-refs.js";
import { presentRate, presentRateRequest } from "../services/rates/present.js";
import { groupRates, lagosToday, lanesFrom, pageOf } from "../services/rates/rules.js";
import { titleCase } from "../templates/email/layout.js";
import type { AuthenticateRequest } from "../utils/interface.js";
import {
  queryProblem,
  rateSearchQuerySchema,
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
