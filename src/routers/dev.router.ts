// src/routes/dev.routes.ts
import { Router } from "express";
import { sendMonthlyReport } from "../jobs/monthly-report.js";
import {
  autoTransitSailedBookings,
  sendSailingReminders,
} from "../jobs/sailing-notifications.js";
import Booking from "../models/booking.model.js";
import catchAsync from "../utils/catch-async.js";

const devRouter = Router();

devRouter.post(
  "/test/auto-transit",
  catchAsync(async (req, res) => {
    await autoTransitSailedBookings();
    res
      .status(200)
      .json({ status: "success", message: "Job ran successfully" });
  }),
);

devRouter.post(
  "/test/sailing-reminder",
  catchAsync(async (req, res) => {
    await sendSailingReminders();
    res.status(200).json({ status: "success", message: "Reminders job ran." });
  }),
);

devRouter.post(
  "/test/monthly-report",
  catchAsync(async (req, res) => {
    await sendMonthlyReport();
    res
      .status(200)
      .json({ status: "success", message: "Monthly report job ran." });
  }),
);

// ── Backfill: preview first, then confirm ──
devRouter.get(
  "/backfill/preview",
  catchAsync(async (req, res) => {
    const bookings = await Booking.find({
      status: "confirmed",
      sailingDate: { $lt: new Date() },
    }).select("bookingNumber sailingDate customerName customerEmail");

    res.status(200).json({
      count: bookings.length,
      bookings,
    });
  }),
);

devRouter.post(
  "/backfill/run",
  catchAsync(async (req, res) => {
    const bookings = await Booking.find({
      status: "confirmed",
      sailingDate: { $lt: new Date() },
    });

    if (!bookings.length) {
      return res.status(200).json({ message: "No bookings to backfill." });
    }

    const result = await Booking.updateMany(
      {
        status: "confirmed",
        sailingDate: { $lt: new Date() },
      },
      { $set: { status: "in_transit" } },
    );

    res.status(200).json({
      status: "success",
      message: `${result.modifiedCount} booking(s) marked as in_transit.`,
    });
  }),
);

export default devRouter;
