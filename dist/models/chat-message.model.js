import { Schema, model } from "mongoose";
const chatMessageSchema = new Schema({
    session: {
        type: Schema.Types.ObjectId,
        ref: "ChatSession",
        required: true,
        index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["customer", "cso"], required: true },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    type: {
        type: String,
        enum: ["text", "system"],
        default: "text",
        index: true,
    },
    status: {
        type: String,
        enum: ["sent", "delivered", "read"],
        default: "sent",
        index: true,
    },
}, { timestamps: true });
chatMessageSchema.index({ session: 1, createdAt: -1 });
chatMessageSchema.index({ session: 1, status: 1 });
const ChatMessage = model("ChatMessage", chatMessageSchema);
export default ChatMessage;
//# sourceMappingURL=chat-message.model.js.map