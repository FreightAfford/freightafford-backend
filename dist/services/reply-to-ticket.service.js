import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import { uploadToCloudinary } from "../utils/upload-to-cloudinary.js";
import { resend } from "./email.service.js";
export const replyToTicket = async (ticketId, adminUserId, message, files = []) => {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket)
        throw new Error("Ticket not found");
    const uploadedAttachments = [];
    for (const file of files) {
        const uploaded = await uploadToCloudinary(file, "attachments");
        uploadedAttachments.push({
            filename: file.originalname,
            path: uploaded.secure_url,
        });
    }
    const subject = `Re: [${ticket.ticket_id}] ${ticket.subject}`;
    const { data, error } = await resend.emails.send({
        from: "FreightAfford Support <exports.ng@info.freightafford.com>",
        to: ticket.customer_email,
        subject,
        text: message,
        attachments: uploadedAttachments,
    });
    if (error)
        throw new Error(error.message);
    const saveTicketMessage = await TicketMessage.create({
        ticket_id: ticket._id,
        sender_email: "exports.ng@info.freightafford.com",
        direction: "outbound",
        subject,
        content: message,
        attachments: uploadedAttachments,
        created_by: adminUserId,
        provider_email_id: data?.id || null,
        message_id: null,
    });
    await Ticket.findByIdAndUpdate(ticketId, {
        status: "pending",
        last_message_at: new Date(),
    });
    return saveTicketMessage;
};
//# sourceMappingURL=reply-to-ticket.service.js.map