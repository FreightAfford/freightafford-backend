import moment from "moment";
import { createTrackingEvent } from "../controllers/tracking.controller.js";
import Booking from "../models/booking.model.js";
import { sendSailingReminderNotification, sendShipmentStatusUpdate, } from "../services/booking.service.js";
export const autoTransitSailedBookings = async () => {
    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();
    // Find confirmed bookings whose sailing date falls today and update their status to "in transit"
    const bookings = await Booking.find({
        sailingDate: { $gte: startOfDay, $lte: endOfDay },
        status: "confirmed",
    })
        .populate("customer", "fullname email")
        .populate("freightRequest", "originPort destinationPort");
    if (!bookings.length) {
        console.log("[autoTransit] No bookings to transition today.");
        return;
    }
    const results = await Promise.allSettled(bookings.map(async (booking) => {
        const customer = booking.customer;
        //   1. Update booking status to "in transit"
        booking.status = "in transit";
        await booking.save();
        //   2. Send the same email that manual flow already uses
        const error = await sendShipmentStatusUpdate(customer.email, customer.fullname, booking.bookingNumber, "in transit");
        if (error) {
            console.error(`[autoTransit] Email failed for booking ${booking.bookingNumber}: ${error}`);
        }
        //   3. Create a tracking event for the status change
        await createTrackingEvent({
            bookingId: booking._id.toString(),
            event: "in_transit",
            description: "Shipment automatically marked in transit on sailing date.",
            location: {
                originPort: booking.freightRequest?.originPort ?? "",
                destinationPort: booking.freightRequest?.destinationPort ?? "",
            },
            userId: "system",
        });
    }));
    const failed = results.filter((r) => r.status === "rejected");
    console.error(`[autoTransit] Processed: ${bookings.length}, Failed: ${failed.length}`);
};
export const sendSailingReminders = async () => {
    const reminderDate = moment().add(7, "days");
    const startOfDay = reminderDate.clone().startOf("day").toDate();
    const endOfDay = reminderDate.clone().endOf("day").toDate();
    const bookings = await Booking.find({
        status: { $in: ["confirmed", "awaiting_confirmation"] },
        sailingDate: { $gte: startOfDay, $lte: endOfDay },
    })
        .populate("customer", "fullname email")
        .populate("freightRequest", "originPort destinationPort");
    if (!bookings.length) {
        console.log("[sailingReminder] No reminders to send today.");
        return;
    }
    const results = await Promise.allSettled(bookings.map(async (booking) => {
        const customer = booking.customer;
        const request = booking.freightRequest;
        const { error } = await sendSailingReminderNotification(customer.email, customer.fullname, booking.bookingNumber, booking.shippingLine ?? "", booking.vessel ?? "", request?.originPort ?? "", request?.destinationPort ?? "", booking.sailingDate);
        if (error) {
            console.error(`[sailingReminder] Email failed for booking ${booking.bookingNumber}:`, error);
        }
    }));
    const failed = results.filter((r) => r.status === "rejected");
    console.log(`[sailingReminder] Reminders sent: ${bookings.length}, Failed: ${failed.length}`);
};
//# sourceMappingURL=sailing-notifications.js.map