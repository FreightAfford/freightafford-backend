import moment from "moment";
import Booking from "../models/booking.model.js";
import { ReportLog } from "../models/report-log.model.js";
import User from "../models/user.model.js";
import { sendMonthlyReportToAdmins } from "../services/booking.service.js";
import { generateSailedReport } from "../utils/generate-sailed-report.js";
// Tracks which months were already reported (in MongoDB, so it survives restarts).
const wasMonthlyReportSent = async (monthKey) => {
    try {
        return (await ReportLog.exists({ monthKey })) != null;
    }
    catch (err) {
        // On DB error, assume sent so a hiccup can't cause a duplicate blast.
        console.error("[monthlyReport] Failed to read sent marker:", err);
        return true;
    }
};
const markMonthlyReportSent = async (monthKey) => {
    try {
        await ReportLog.updateOne({ monthKey }, { $setOnInsert: { monthKey, sentAt: new Date() } }, { upsert: true });
    }
    catch (err) {
        console.error("[monthlyReport] Failed to persist sent marker:", err);
    }
};
// Defaults to the current month (the month-end cron run). Pass an explicit
// month to (re)send a specific month, e.g. the catch-up for a missed run.
export const sendMonthlyReport = async (target = moment()) => {
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
    const recipientEmails = admins.map((a) => a.email);
    // ── Fetch sailed bookings for this month ──
    const bookings = await Booking.find({
        status: "in_transit",
        sailingDate: { $gte: startOfMonth, $lte: endOfMonth },
    })
        .populate("customer", "fullname")
        .populate("freightRequest", "originPort destinationPort containerSize containerQuantity adminCounterPrice proposedPrice");
    // ── Build report rows ──
    const reportRows = bookings.map((booking) => {
        const request = booking.freightRequest;
        const customer = booking.customer;
        return {
            bookingNumber: booking.bookingNumber,
            carrierBookingNumber: booking.carrierBookingNumber ?? "N/A",
            customerName: customer?.fullname ?? booking.customerName,
            originPort: request?.originPort ?? "N/A",
            destinationPort: request?.destinationPort ?? "N/A",
            vessel: booking.vessel ?? "N/A",
            shippingLine: booking.shippingLine ?? "N/A",
            sailingDate: booking.sailingDate,
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
    const { error } = await sendMonthlyReportToAdmins(recipientEmails, monthLabel, bookings.length, totalRevenue, fileName, attachment);
    if (error) {
        console.error("[monthlyReport] Failed to send report:", error);
        return;
    }
    // Only recorded on success, so a failed send is retried on the next run.
    await markMonthlyReportSent(monthKey);
    console.log(`[monthlyReport] Report for ${monthLabel} sent to ${recipientEmails.join(", ")} — ${bookings.length} shipment(s).`);
};
// Catch-up: ensures the most recently completed month was reported. Runs on
// startup and just after each month rollover, so a month-end run missed due to
// downtime is recovered instead of silently lost. Idempotent — the marker
// makes it a no-op once that month has been sent.
export const catchUpMonthlyReport = async () => {
    const lastMonth = moment().subtract(1, "month");
    const monthKey = lastMonth.format("YYYY-MM");
    if (await wasMonthlyReportSent(monthKey)) {
        console.log(`[monthlyReport] Catch-up: ${lastMonth.format("MMMM YYYY")} already reported. Skipping.`);
        return;
    }
    console.log(`[monthlyReport] Catch-up: sending missed report for ${lastMonth.format("MMMM YYYY")}...`);
    await sendMonthlyReport(lastMonth);
};
//# sourceMappingURL=monthly-report.js.map