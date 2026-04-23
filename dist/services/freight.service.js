import envConfig from "../configurations/env.configuration.js";
import FREIGHTREQUEST_ACCEPTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE from "../templates/freight/request.accepted.js";
import FREIGHTREQUEST_COUNTER_BY_ADMIN_TO_CUSTOMER_TEMPLATE from "../templates/freight/request.counter.js";
import FREIGHTREQUEST_MADE_TO_ADMIN_TEMPLATE from "../templates/freight/request.js";
import FREIGHTREQUEST_REJECTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE from "../templates/freight/request.rejected.js";
import FREIGHTREQUEST_RESPOND_BY_CUSTOMER_TO_ADMIN_TEMPLATE from "../templates/freight/request.respond.js";
import { resend } from "./email.service.js";
export const sendAdminFreightRequestNotification = async (request) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: ["freightaffords@gmail.com", "devfranklinandrew@gmail.com"],
        subject: "New Freight Request Submitted",
        html: FREIGHTREQUEST_MADE_TO_ADMIN_TEMPLATE.replace("{{ORIGIN_PORT}}", request.originPort)
            .replace("{{DESTINATION_PORT}}", request.destinationPort)
            .replace("{{COMMODITY}}", request.commodity)
            .replace("{{CARGO_WEIGHT}}", request.cargoWeight.toLocaleString())
            .replace("{{PROPOSED_PRICE}}", request.proposedPrice.toLocaleString()),
    });
};
export const sendCustomerAcceptedNotification = async (email, fullname, bookingNo) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Freight Request Accepted",
        html: FREIGHTREQUEST_ACCEPTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace("{{USERNAME}}", fullname.split(" ")[0]).replace("{{BOOKING_NUMBER}}", bookingNo),
    });
};
export const sendCustomerCounterNotification = async (email, fullname, price, reason) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Freight Counter Offer",
        html: FREIGHTREQUEST_COUNTER_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{COUNTER_PRICE}}", price.toLocaleString())
            .replace("{{REASON}}", reason),
    });
};
export const sendCustomerRejectedNotification = async (email, fullname, reason) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Freight Request Rejected",
        html: FREIGHTREQUEST_REJECTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace("{{USERNAME}}", fullname.split(" ")[0]).replace("{{REASON}}", reason),
    });
};
export const sendAdminCustomerDecisionNotification = async (adminEmail, fullname, decision) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: adminEmail,
        subject: "Customer Responded to Counter Offer",
        html: FREIGHTREQUEST_RESPOND_BY_CUSTOMER_TO_ADMIN_TEMPLATE.replace("{{FULLNAME}}", fullname)
            .replace("{{DECISION}}", decision)
            .replace("{{COLOR}}", decision === "accept" ? "#10b981" : "#ef4444"),
    });
};
//# sourceMappingURL=freight.service.js.map