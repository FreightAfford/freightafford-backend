import { Ticket } from "../models/ticket.model.js";
import { generateTicketId } from "../utils/generate-ticket.js";
export const createTicket = async (email) => {
    const existing = await Ticket.findOne({
        provider_email_id: email.providerEmailId,
    });
    if (existing)
        return { ticket: existing, isNew: false };
    const ticketId = await generateTicketId();
    const ticket = await Ticket.create({
        ticket_id: ticketId,
        customer_email: email.from,
        subject: email.subject,
        provider_email_id: email.providerEmailId,
        message_id: email.messageId,
    });
    return { ticket, isNew: true };
};
//# sourceMappingURL=create-ticket.service.js.map