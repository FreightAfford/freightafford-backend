import { Schema, model } from "mongoose";
const chatSessionSchema = new Schema({
    type: {
        type: String,
        enum: ["general", "request_linked"],
        required: true,
        default: "general",
    },
    status: {
        type: String,
        enum: ["waiting", "active", "closed", "reassigned"],
        default: "waiting",
        index: true,
    },
    customer: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    assignedCSO: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    freightRequest: {
        type: Schema.Types.ObjectId,
        ref: "FreightRequest",
        default: null,
    },
    booking: { type: Schema.Types.ObjectId, ref: "Booking", default: null },
    queuePosition: { type: Number, min: 0, default: 0 },
    metadata: {
        acceptedAt: { type: Date },
        closedAt: { type: Date },
        reassignedAt: { type: Date },
        closedBy: { type: Schema.Types.ObjectId, ref: "User" },
        previousCSOId: { type: Schema.Types.ObjectId, ref: "User" },
    },
}, { timestamps: true });
chatSessionSchema.index({ status: 1, createdAt: 1 });
chatSessionSchema.index({ assignedCSO: 1, status: 1 });
chatSessionSchema.index({ customer: 1, status: 1 });
const ChatSession = model("ChatSession", chatSessionSchema);
export default ChatSession;
//# sourceMappingURL=chat-session.model.js.map