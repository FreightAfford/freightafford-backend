import envConfig from "../configurations/env.configuration.js";
import BILL_OF_LADING_SENT_BY_ADMIN from "../templates/booking/bl.booking.js";
import BOOKING_SHIPPING_UPDATE_TO_CUSTOMER from "../templates/booking/booking.shipping.js";
import BOOKING_SHIPPING_STATUS_TO_CUSTOMER from "../templates/booking/booking.status.js";
import CONTAINER_NUMBER_UPDATE_BY_ADMIN from "../templates/booking/container.booking.js";
import { resend } from "./email.service.js";
export const sendBookingScheduleNotification = async (email, fullname, carrierBookingNumber, shippingLine, vessel, sailingDate) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Your Shipment Has Been Scheduled",
        html: BOOKING_SHIPPING_UPDATE_TO_CUSTOMER.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{SHIPPING_LINE}}", shippingLine)
            .replace("{{VESSEL}}", vessel)
            .replace("{{SAILING_DATE}}", sailingDate.toDateString())
            .replace("{{CARRIER_BOOKING_NO}}", carrierBookingNumber),
    });
};
export const sendShipmentStatusUpdate = async (email, fullname, bookingNumber, status) => {
    return resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Shipment Status Update",
        html: BOOKING_SHIPPING_STATUS_TO_CUSTOMER.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{BOOKING_NUMBER}}", bookingNumber)
            .replace("{{STATUS}}", status),
    });
};
export const sendBillOfLadingNotification = async (email, fullname, bookingNumber, status, type) => {
    return resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Bill of Lading Document",
        html: BILL_OF_LADING_SENT_BY_ADMIN.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{BOOKING_NUMBER}}", bookingNumber)
            .replace("{{TYPE}}", type)
            .replace("{{STATUS}}", status),
    });
};
export const sendContainerNumbersNotification = async (email, fullname, bookingNumber, originPort, destinationPort, containerNumbers) => await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Container Numbers Update",
    html: CONTAINER_NUMBER_UPDATE_BY_ADMIN.replace("{{USERNAME}}", fullname.split(" ")[0])
        .replace("{{BOOKING_NUMBER}}", bookingNumber)
        .replace("{{ORIGIN_PORT}}", originPort)
        .replace("{{DESTINATION_PORT}}", destinationPort)
        .replace("{{CONTAINER_NUMBERS}}", containerNumbers.join(", ")),
});
//# sourceMappingURL=booking.service.js.map