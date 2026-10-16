import { APP_URL, FROM, button, details, emailLayout, escapeHtml, formatDate, greeting, paragraph, route, tags, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
const BOOKINGS_LINK = `${APP_URL}/app/customer/bookings`;
export const sendBookingScheduleNotification = async (email, fullname, carrierBookingNumber, shippingLine, vessel, sailingDate, subject, booking = {}) => {
    const sails = formatDate(sailingDate);
    const isUpdate = !!booking.isUpdate;
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: subject ??
            [isUpdate ? "Shipping details updated" : "Shipment scheduled", [vessel, sails].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(": "),
        html: emailLayout({
            preheader: [booking.bookingNumber, shippingLine].filter(Boolean).join(" · "),
            reference: ["Booking", booking.bookingNumber ?? ""],
            status: [isUpdate ? "Updated" : "Scheduled", "blue"],
            heading: isUpdate ? "Your shipping details have changed" : "Your shipment is scheduled",
            body: paragraph(`${greeting(fullname)} here are your ${isUpdate ? "latest " : ""}sailing details.`) +
                route(booking, [
                    ["Sails", sails],
                    ["ETA", formatDate(booking.eta)],
                ]) +
                details([
                    ["Shipping line", escapeHtml(shippingLine ?? "")],
                    ["Vessel", escapeHtml(vessel ?? "")],
                    ["Sailing date", route(booking) ? "" : sails],
                    ["Carrier booking", escapeHtml(carrierBookingNumber ?? ""), { mono: true }],
                ]) +
                button("Track shipment", BOOKINGS_LINK),
        }),
    });
};
// Callers pass "in_transit", "in transit" or Maersk's text; normalise first.
const STATUS_COPY = {
    "awaiting confirmation": { label: "Awaiting confirmation", tone: "grey", heading: "Your booking is awaiting confirmation", subject: "is awaiting confirmation" },
    confirmed: { label: "Confirmed", tone: "blue", heading: "Your booking is confirmed", subject: "is confirmed" },
    "in transit": { label: "In transit", tone: "blue", heading: "Your shipment is in transit", subject: "is in transit" },
    arrived: { label: "Arrived", tone: "green", heading: "Your shipment has arrived", subject: "has arrived" },
    delivered: { label: "Delivered", tone: "green", heading: "Your shipment has been delivered", subject: "has been delivered" },
    cancelled: { label: "Cancelled", tone: "red", heading: "Your booking has been cancelled", subject: "has been cancelled" },
};
export const sendShipmentStatusUpdate = async (email, fullname, bookingNumber, status, booking = {}) => {
    const key = String(status ?? "").toLowerCase().replace(/_/g, " ").trim();
    const label = key.replace(/^./, (c) => c.toUpperCase());
    const copy = STATUS_COPY[key] ?? {
        label,
        tone: "grey",
        heading: `Your booking is now ${key}`,
        subject: `is now ${key}`,
    };
    const eta = formatDate(booking.eta);
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: `Booking ${bookingNumber} ${copy.subject}`,
        html: emailLayout({
            preheader: eta && key !== "cancelled" && key !== "delivered" ? `ETA: ${eta}` : copy.label,
            reference: ["Booking", bookingNumber],
            status: [copy.label, copy.tone],
            heading: copy.heading,
            body: paragraph(`${greeting(fullname)} your shipment status has changed.`) +
                route(booking, [
                    ["Vessel", escapeHtml(booking.vessel ?? "")],
                    ["ETA", eta],
                ]) +
                button("Track shipment", BOOKINGS_LINK),
        }),
    });
};
const DOCUMENT_TYPES = {
    house: "House Bill of Lading",
    master: "Master Bill of Lading",
    release_order: "Release order",
    booking_confirmation: "Booking confirmation",
    draft_bill_of_lading: "Draft Bill of Lading",
    original_bill_of_lading: "Original Bill of Lading",
};
const DOCUMENT_STATUS = {
    drafted: ["Draft", "blue"],
    pending_amendment: ["Pending amendment", "ochre"],
    finalized: ["Final", "green"],
};
const humanise = (value) => String(value ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const sendBillOfLadingNotification = async (email, fullname, bookingNumber, status, type) => {
    const documentName = DOCUMENT_TYPES[type] ?? humanise(type);
    const [statusLabel, tone] = DOCUMENT_STATUS[status] ?? [humanise(status), "blue"];
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: `${documentName} ready: ${bookingNumber}`,
        html: emailLayout({
            preheader: `${documentName} · ${statusLabel}`,
            reference: ["Booking", bookingNumber],
            status: [statusLabel, tone],
            heading: "A new document is ready",
            body: paragraph(`${greeting(fullname)} a new document was added to your booking.`) +
                details([
                    ["Document", escapeHtml(documentName)],
                    ["Status", escapeHtml(statusLabel)],
                    ["Booking", escapeHtml(bookingNumber), { mono: true }],
                ]) +
                button("View document", `${APP_URL}/app/customer/documents`),
        }),
    });
};
export const sendContainerNumbersNotification = async (email, fullname, bookingNumber, originPort, destinationPort, containerNumbers, ports = {}) => await resend.emails.send({
    from: FROM(),
    to: email,
    subject: `Container numbers for ${bookingNumber}`,
    html: emailLayout({
        preheader: containerNumbers.join(", "),
        reference: ["Booking", bookingNumber],
        status: ["Containers assigned", "blue"],
        heading: "Your container numbers",
        body: paragraph(`${greeting(fullname)} use these for tracking and documents.`) +
            tags(containerNumbers) +
            route({ originPort, destinationPort, ...ports }) +
            button("View booking", BOOKINGS_LINK),
    }),
});
export const sendSailingReminderNotification = async (email, fullname, bookingNumber, shippingLine, vessel, originPort, destinationPort, sailingDate, ports = {}) => {
    const sails = formatDate(sailingDate);
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: `Sailing in 7 days: ${bookingNumber}`,
        html: emailLayout({
            preheader: [vessel, sails].filter(Boolean).join(" · "),
            reference: ["Booking", bookingNumber],
            status: ["Sails in 7 days", "ochre"],
            heading: "Your shipment sails in 7 days",
            body: paragraph(`${greeting(fullname)} please make sure your cargo and documents are ready.`) +
                route({ originPort, destinationPort, ...ports }, [
                    ["Sails", sails],
                    ["Vessel", escapeHtml(vessel || "TBA")],
                ]) +
                details([
                    ["Shipping line", escapeHtml(shippingLine || "TBA")],
                    // Shown here only when the route card can't show it
                    ["Sailing date", route({ originPort, destinationPort }) ? "" : sails],
                ]) +
                button("View booking", BOOKINGS_LINK),
        }),
    });
};
export const sendMonthlyReportToAdmins = async (recipients, monthLabel, totalShipments, totalRevenue, fileName, attachment) => {
    return resend.emails.send({
        from: FROM(),
        to: recipients,
        subject: `Sailed shipments report: ${monthLabel}`,
        html: emailLayout({
            preheader: `${totalShipments} shipments · ${totalRevenue}`,
            status: ["Monthly report", "blue"],
            heading: `${monthLabel} report`,
            body: paragraph("The full report is attached.") +
                details([
                    ["Shipments sailed", String(totalShipments), { big: true }],
                    ["Total revenue", escapeHtml(totalRevenue), { big: true, mono: true }],
                    ["File", escapeHtml(fileName), { mono: true }],
                ]),
        }),
        attachments: [
            {
                filename: fileName,
                content: attachment.toString("base64"),
            },
        ],
    });
};
//# sourceMappingURL=booking.service.js.map