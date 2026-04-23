import { Schema, model } from "mongoose";
const ticketMessageSchema = new Schema({
    ticket_id: {
        type: Schema.Types.ObjectId,
        ref: "Ticket",
        required: true,
        index: true,
    },
    sender_email: { type: String, required: true },
    direction: {
        type: String,
        enum: ["inbound", "outbound", "internal"],
        required: true,
    },
    subject: { type: String, default: "" },
    content: { type: String, default: "" },
    provider_email_id: { type: String, default: null },
    message_id: { type: String, default: null },
    attachments: { type: Array, default: [] },
    created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
const TicketMessage = model("TicketMessage", ticketMessageSchema);
export default TicketMessage;
//# sourceMappingURL=ticket-message.model.js.map