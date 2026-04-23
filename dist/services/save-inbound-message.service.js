import TicketMessage from "../models/ticket-message.model.js";
export const saveInboundMessage = async (ticket, email) => {
    const existing = await TicketMessage.findOne({
        provider_email_id: email.providerEmailId,
    });
    if (existing)
        return existing;
    return await TicketMessage.create({
        ticket_id: ticket._id,
        sender_email: email.from,
        direction: "inbound",
        subject: email.subject,
        content: email.body || "",
        provider_email_id: email.providerEmailId,
        message_id: email.messageId,
        attachments: email.attachments || [],
    });
};
//# sourceMappingURL=save-inbound-message.service.js.map