import moment from "moment";
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { sendMonthlyReportToAdmins } from "../services/booking.service.js";
import { generateSailedReport } from "../utils/generate-sailed-report.js";
import type { IFreightRequest, IUser } from "../utils/interface.js";

export const sendMonthlyReport = async () => {
  const startOfMonth = moment().startOf("month").toDate();
  const endOfMonth = moment().endOf("month").toDate();
  const monthLabel = moment().format("MMMM YYYY");
  const fileName = `Sailed-Shipments-${moment().format("MMMM-YYYY")}.xlsx`;

  // ── Fetch admin recipients ──
  const admins = await User.find({ role: "admin" }, "email fullname");

  if (!admins.length) {
    console.log("[monthlyReport] No admin recipients found. Aborting.");
    return;
  }

  const recipientEmails = admins.map((a) => (a as unknown as IUser).email);

  // ── Fetch sailed bookings for this month ──
  const bookings = await Booking.find({
    status: "confirmed",
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

  console.log(
    `[monthlyReport] Report for ${monthLabel} sent to ${recipientEmails.join(", ")} — ${bookings.length} shipment(s).`,
  );
};
