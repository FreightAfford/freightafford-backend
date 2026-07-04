import moment from "moment";
import fs from "node:fs";
import path from "node:path";
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { sendMonthlyReportToAdmins } from "../services/booking.service.js";
import { generateSailedReport } from "../utils/generate-sailed-report.js";
import type { IFreightRequest, IUser } from "../utils/interface.js";

// Persistent record of which months have already been reported (one
// `YYYY-MM` key per line). Lets the report survive a missed month-end run:
// if the server was down at 23:59 on the last day, the catch-up still sends it.
const MONTHLY_REPORT_MARKER = path.resolve(
  process.cwd(),
  ".monthly-report-sent",
);

const wasMonthlyReportSent = (monthKey: string): boolean => {
  try {
    return fs
      .readFileSync(MONTHLY_REPORT_MARKER, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .includes(monthKey);
  } catch {
    return false;
  }
};

const markMonthlyReportSent = (monthKey: string) => {
  try {
    const existing = fs.existsSync(MONTHLY_REPORT_MARKER)
      ? fs.readFileSync(MONTHLY_REPORT_MARKER, "utf8")
      : "";
    const keys = new Set(
      existing
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    keys.add(monthKey);
    fs.writeFileSync(MONTHLY_REPORT_MARKER, `${[...keys].join("\n")}\n`);
  } catch (err) {
    console.error("[monthlyReport] Failed to persist sent marker:", err);
  }
};

// Defaults to the current month (the month-end cron run). Pass an explicit
// month to (re)send a specific month, e.g. the catch-up for a missed run.
export const sendMonthlyReport = async (target: moment.Moment = moment()) => {
  const monthKey = target.format("YYYY-MM");
  const startOfMonth = target.clone().startOf("month").toDate();
  const endOfMonth = target.clone().endOf("month").toDate();
  const monthLabel = target.format("MMMM YYYY");
  const fileName = `Sailed-Shipments-${target.format("MMMM-YYYY")}.xlsx`;

  // ── Fetch admin recipients ──
  const admins = await User.find({ role: "admin" }, "email fullname");

  if (!admins.length) {
    console.log("[monthlyReport] No admin recipients found. Aborting.");
    return;
  }

  const recipientEmails = admins.map((a) => (a as unknown as IUser).email);

  // ── Fetch sailed bookings for this month ──
  const bookings = await Booking.find({
    status: "in_transit",
    sailingDate: { $gte: startOfMonth, $lte: endOfMonth },
  })
    .populate("customer", "fullname")
    .populate(
      "freightRequest",
      "originPort destinationPort containerSize containerQuantity adminCounterPrice proposedPrice",
    );

  // ── Build report rows ──
  const reportRows = bookings.map((booking) => {
    const request = booking.freightRequest as unknown as IFreightRequest;
    const customer = booking.customer as unknown as IUser;

    return {
      bookingNumber: booking.bookingNumber,
      carrierBookingNumber: booking.carrierBookingNumber ?? "N/A",
      customerName: customer?.fullname ?? booking.customerName,
      originPort: request?.originPort ?? "N/A",
      destinationPort: request?.destinationPort ?? "N/A",
      vessel: booking.vessel ?? "N/A",
      shippingLine: booking.shippingLine ?? "N/A",
      sailingDate: booking.sailingDate!,
      containerSize: request?.containerSize ?? "N/A",
      containerQuantity: request?.containerQuantity ?? 0,
      freightCost: request?.adminCounterPrice ?? request?.proposedPrice ?? 0,
    };
  });

  const totalRevenue = reportRows
    .reduce((sum, r) => sum + r.freightCost, 0)
    .toLocaleString("en-US", { style: "currency", currency: "USD" });

  // ── Generate Excel buffer ──
  const attachment = await generateSailedReport(reportRows, monthLabel);

  // ── Send email ──
  const { error } = await sendMonthlyReportToAdmins(
    recipientEmails,
    monthLabel,
    bookings.length,
    totalRevenue,
    fileName,
    attachment,
  );

  if (error) {
    console.error("[monthlyReport] Failed to send report:", error);
    return;
  }

  // Only recorded on success, so a failed send is retried on the next run.
  markMonthlyReportSent(monthKey);

  console.log(
    `[monthlyReport] Report for ${monthLabel} sent to ${recipientEmails.join(", ")} — ${bookings.length} shipment(s).`,
  );
};

// Catch-up: ensures the most recently completed month was reported. Runs on
// startup and just after each month rollover, so a month-end run missed due to
// downtime is recovered instead of silently lost. Idempotent — the marker
// makes it a no-op once that month has been sent.
export const catchUpMonthlyReport = async () => {
  const lastMonth = moment().subtract(1, "month");
  const monthKey = lastMonth.format("YYYY-MM");

  if (wasMonthlyReportSent(monthKey)) {
    console.log(
      `[monthlyReport] Catch-up: ${lastMonth.format("MMMM YYYY")} already reported. Skipping.`,
    );
    return;
  }

  console.log(
    `[monthlyReport] Catch-up: sending missed report for ${lastMonth.format("MMMM YYYY")}...`,
  );
  await sendMonthlyReport(lastMonth);
};
