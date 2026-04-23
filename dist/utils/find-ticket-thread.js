import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import { extractTicketId } from "./extract-ticket-id.js";
export const findThreadTicket = async (email) => {
    const headers = email.headers || {};
    const inReplyTo = headers["in-reply-to"];
    if (inReplyTo) {
        const oldMessage = await TicketMessage.findOne({ message_id: inReplyTo });
        if (oldMessage)
            return await Ticket.findById(oldMessage.ticket_id);
    }
    const subjectId = extractTicketId(email.subject);
    if (subjectId)
        return await Ticket.findOne({ ticket_id: subjectId });
    return null;
};
//# sourceMappingURL=find-ticket-thread.js.map