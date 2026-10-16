import { SUPPORT_FROM, details, emailLayout, escapeHtml, firstNameText, greeting, paragraph, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
import { findTicketRecipientName } from "./ticket-recipient-name.service.js";
export const sendTicketAcknowledgement = async (email, ticketId, subject) => {
    const name = await findTicketRecipientName(email);
    return await resend.emails.send({
        from: SUPPORT_FROM,
        to: email,
        subject: `[${ticketId}] We received your request`,
        text: `${name ? `Hi ${firstNameText(name)},` : "Hello,"}

We've received your request: ${subject}
Your ticket ID is ${ticketId}. We'll reply within 24 hours. Reply to this email to add details.

Freightafford Support`,
        html: emailLayout({
            preheader: "We'll reply within 24 hours.",
            reference: ["Ticket", ticketId],
            status: ["Received", "blue"],
            heading: "We've received your request",
            body: paragraph(`${greeting(name)} we'll reply within 24 hours. Reply to this email to add details.`) +
                details([
                    ["Ticket", escapeHtml(ticketId), { mono: true }],
                    ["Subject", escapeHtml(subject)],
                ]),
        }),
    });
};
//# sourceMappingURL=send-ticket-acknowledgement.service.js.map