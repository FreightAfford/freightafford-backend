import { Schema, model } from "mongoose";
const ticketSchema = new Schema({
    ticket_id: { type: String, required: true, index: true, unique: true },
    customer_email: { type: String, required: true, index: true },
    subject: { type: String, required: true, trim: true },
    status: {
        type: String,
        enum: ["open", "pending", "resolved", "closed"],
        default: "open",
        index: true,
    },
    assigned_to: { type: Schema.Types.ObjectId, ref: "User", default: null },
    provider_email_id: { type: String, unique: true, sparse: true },
    message_id: { type: String, default: null },
    last_message_at: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, { timestamps: true });
export const Ticket = model("Ticket", ticketSchema);
//# sourceMappingURL=ticket.model.js.map