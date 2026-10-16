import { SUPPORT_FROM, details, emailLayout, escapeHtml, firstNameText, greeting, paragraph, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
import { findTicketRecipientName } from "./ticket-recipient-name.service.js";
export const sendTicketClosedNotification = async (email, ticketId, subject) => {
    const name = await findTicketRecipientName(email);
    return await resend.emails.send({
        from: SUPPORT_FROM,
        to: email,
        subject: `[${ticketId}] Your ticket has been closed`,
        text: `${name ? `Hi ${firstNameText(name)},` : "Hello,"}

We closed ticket ${ticketId} ("${subject}") after 7 days without a reply. If you still need help, reply to this email.

Freightafford Support`,
        html: emailLayout({
            preheader: "Closed after 7 days without a reply.",
            reference: ["Ticket", ticketId],
            status: ["Closed", "grey"],
            heading: "Your ticket has been closed",
            body: 
            // A reply carries the ticket ID in the subject, which reopens the ticket.
            paragraph(`${greeting(name)} we closed this ticket after 7 days without a reply. If you still need help, reply to this email.`) +
                details([["Subject", escapeHtml(subject)]]),
        }),
    });
};
//# sourceMappingURL=send-ticket-closed-notification.service.js.map