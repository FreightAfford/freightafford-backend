import envConfig from "../configurations/env.configuration.js";
import {
  CUSTOMER_BATCH_ACCEPTED_TEMPLATE,
  FREIGHTREQUEST_ACCEPTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE,
} from "../templates/freight/request.accepted.js";
import FREIGHTREQUEST_COUNTER_BY_ADMIN_TO_CUSTOMER_TEMPLATE from "../templates/freight/request.counter.js";
import {
  FREIGHTREQUEST_BATCH_MADE_TO_ADMIN_TEMPLATE,
  FREIGHTREQUEST_MADE_TO_ADMIN_TEMPLATE,
} from "../templates/freight/request.js";
import FREIGHTREQUEST_REJECTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE from "../templates/freight/request.rejected.js";
import FREIGHTREQUEST_RESPOND_BY_CUSTOMER_TO_ADMIN_TEMPLATE from "../templates/freight/request.respond.js";
import { resend } from "./email.service.js";

export const sendAdminFreightRequestNotification = async (request: {
  originPort: string;
  destinationPort: string;
  commodity: string;
  proposedPrice: number;
  cargoWeight: number;
  quantity: number;
  batchId: string | null;
}) => {
  const dashboardLink = request.batchId
    ? `https://freightafford.com/app/admin/requests?batchId=${request.batchId}`
    : "https://freightafford.com/app/admin";
  const html =
    request.quantity > 1
      ? FREIGHTREQUEST_BATCH_MADE_TO_ADMIN_TEMPLATE.replace(
          "{{QUANTITY}}",
          String(request.quantity),
        )
          .replace("{{QUANTITY}}", String(request.quantity))
          .replace("{{QUANTITY}}", String(request.quantity))
          .replace("{{ORIGIN_PORT}}", request.originPort)
          .replace("{{DESTINATION_PORT}}", request.destinationPort)
          .replace("{{COMMODITY}}", request.commodity)
          .replace("{{CARGO_WEIGHT}}", request.cargoWeight.toLocaleString())
          .replace("{{PROPOSED_PRICE}}", request.proposedPrice.toLocaleString())
          .replace("{{DASHBOARD_LINK}}", dashboardLink)
      : FREIGHTREQUEST_MADE_TO_ADMIN_TEMPLATE.replace(
          "{{ORIGIN_PORT}}",
          request.originPort,
        )
          .replace("{{DESTINATION_PORT}}", request.destinationPort)
          .replace("{{COMMODITY}}", request.commodity)
          .replace("{{CARGO_WEIGHT}}", request.cargoWeight.toLocaleString())
          .replace(
            "{{PROPOSED_PRICE}}",
            request.proposedPrice.toLocaleString(),
          );

  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: ["freightaffords@gmail.com", "devfranklinandrew@gmail.com"],
    subject:
      request.quantity > 1
        ? `New Batch: ${request.quantity} Freight Requests Submitted`
        : "New Freight Request Submitted",
    html,
  });
};

export const sendCustomerAcceptedNotification = async (
  email: string,
  fullname: string,
  bookingNo: string,
) => {
  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Freight Request Accepted",
    html: FREIGHTREQUEST_ACCEPTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace(
      "{{USERNAME}}",
      fullname.split(" ")[0] as string,
    ).replace("{{BOOKING_NUMBER}}", bookingNo),
  });
};

export const sendCustomerBatchAcceptedNotification = async (
  email: string,
  fullname: string,
  bookingNumbers: string[],
) => {
  const bookingListHtml = bookingNumbers
    .map((num) => `<li style="margin-bottom: 6px;">${num}</li>`)
    .join("");

  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: [email],
    subject: `${bookingNumbers.length} Freight Requests Accepted`,
    html: CUSTOMER_BATCH_ACCEPTED_TEMPLATE.replace("{{FULLNAME}}", fullname)
      .replace("{{COUNT}}", String(bookingNumbers.length))
      .replace("{{COUNT}}", String(bookingNumbers.length))
      .replace("{{BOOKING_LIST}}", bookingListHtml),
  });
};

export const sendCustomerCounterNotification = async (
  email: string,
  fullname: string,
  price: number,
  reason: string,
) => {
  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Freight Counter Offer",
    html: FREIGHTREQUEST_COUNTER_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace(
      "{{USERNAME}}",
      fullname.split(" ")[0] as string,
    )
      .replace("{{COUNTER_PRICE}}", price.toLocaleString())
      .replace("{{REASON}}", reason),
  });
};

export const sendCustomerRejectedNotification = async (
  email: string,
  fullname: string,
  reason: string,
) => {
  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Freight Request Rejected",
    html: FREIGHTREQUEST_REJECTED_BY_ADMIN_TO_CUSTOMER_TEMPLATE.replace(
      "{{USERNAME}}",
      fullname.split(" ")[0] as string,
    ).replace("{{REASON}}", reason),
  });
};

export const sendAdminCustomerDecisionNotification = async (
  adminEmail: string[],
  fullname: string,
  decision: string,
) => {
  return await resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: adminEmail,
    subject: "Customer Responded to Counter Offer",
    html: FREIGHTREQUEST_RESPOND_BY_CUSTOMER_TO_ADMIN_TEMPLATE.replace(
      "{{FULLNAME}}",
      fullname,
    )
      .replace("{{DECISION}}", decision)
      .replace("{{COLOR}}", decision === "accept" ? "#10b981" : "#ef4444"),
  });
};
