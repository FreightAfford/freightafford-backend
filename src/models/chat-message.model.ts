import { Schema, model, type Document, type Types } from "mongoose";

export type MessageStatus = "sent" | "delivered" | "read";
export type MessageType = "text" | "system";
export type SenderRole = "customer" | "cso";

export interface IMessage extends Document {
  session: Types.ObjectId;
  sender: Types.ObjectId;
  senderRole: SenderRole;
  content: string;
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IMessage>(
  {
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
  },
  { timestamps: true },
);

chatMessageSchema.index({ session: 1, createdAt: -1 });
chatMessageSchema.index({ session: 1, status: 1 });

const ChatMessage = model<IMessage>("ChatMessage", chatMessageSchema);
export default ChatMessage;
