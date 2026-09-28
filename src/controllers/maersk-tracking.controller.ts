import type { NextFunction, Response } from "express";
import AppError from "../errors/app.error.js";
import { deriveShipmentSummary } from "../integrations/maersk/tracking.client.js";
import {
  fetchBookingEvents,
  syncBookingWithMaersk,
} from "../services/maersk-sync.service.js";
import type {
  AuthenticateRequest,
  IFreightRequest,
} from "../utils/interface.js";
import { findBookingForUser } from "./booking.controller.js";

// Internal document steps customers don't need to see
const HIDDEN_CODES = new Set(["DRFT", "PENA"]);

// AUTHENTICATED: Live Maersk Track & Trace events for a booking.
// Customers only see their own bookings (same rule as getSingleBooking).
export const getBookingMaerskEvents = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const booking = await findBookingForUser(String(req.params.id), req.user!);
  if (!booking) return next(new AppError("Booking not found", 404));

  if (booking.shippingLine !== "Maersk")
    return next(
      new AppError("Live tracking is only available for Maersk shipments", 404),
    );

  await booking.populate(
    "freightRequest",
    "originPortCode destinationPortCode",
  );
  const request = booking.freightRequest as unknown as IFreightRequest | null;

  const { reference, events } = await fetchBookingEvents(booking);
  const summary = deriveShipmentSummary(events, {
    polCode: request?.originPortCode,
    podCode: request?.destinationPortCode,
  });

  res.status(200).json({
    status: "success",
    data: {
      reference,
      events: events.filter((e) => !HIDDEN_CODES.has(e.code)),
      summary,
    },
  });
};

// STAFF: Sync one booking with Maersk now (dates, vessel, forward status)
export const syncBookingMaersk = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { outcome, booking, message } = await syncBookingWithMaersk(
    String(req.params.id),
  );

  if (!booking) return next(new AppError("Booking not found", 404));
  if (outcome === "skipped")
    return next(
      new AppError("Only active Maersk bookings can be synced", 400),
    );
  if (outcome === "error")
    return next(
      new AppError(
        message ??
          "Live tracking is temporarily unavailable. Please try again shortly.",
        503,
      ),
    );

  res.status(200).json({ status: "success", outcome, data: booking });
};
