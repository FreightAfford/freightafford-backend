import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import { uploadToCloudinary } from "../utils/upload-to-cloudinary.js";
import { SUPPORT_FROM, emailLayout, gap, greeting, message as messageBlock, paragraph, smallPrint, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
import { findTicketRecipientName } from "./ticket-recipient-name.service.js";
export const replyToTicket = async (ticketId, adminUserId, adminFullName, message, files = []) => {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket)
        throw new Error("Ticket not found");
    const uploadedAttachments = [];
    for (const file of files) {
        const uploaded = await uploadToCloudinary(file, "attachments");
        uploadedAttachments.push({
            filename: file.originalname,
            url: uploaded.secure_url,
            size: file.size,
            content_type: file.mimetype,
        });
    }
    const subject = `Re: [${ticket.ticket_id}] ${ticket.subject}`;
    const customerName = await findTicketRecipientName(ticket.customer_email);
    const { data, error } = await resend.emails.send({
        from: SUPPORT_FROM,
        to: ticket.customer_email,
        subject,
        text: message,
        html: emailLayout({
            preheader: String(message ?? "").slice(0, 120),
            reference: ["Ticket", ticket.ticket_id],
            status: ["New reply", "blue"],
            heading: "New reply on your ticket",
            body: paragraph(`${greeting(customerName)} here's the latest on your ticket.`) +
                messageBlock(adminFullName, message) +
                gap(18) +
                smallPrint("Reply to this email to respond."),
        }),
        attachments: uploadedAttachments.map((file) => ({
            filename: file.filename,
            path: file.url,
        })),
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