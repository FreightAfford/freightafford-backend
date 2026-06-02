import { Schema, model, type Document, type Types } from "mongoose";

export interface IChatSessionMetaData {
  acceptedAt?: Date;
  closedAt?: Date;
  reassignedAt?: Date;
  closedBy?: Types.ObjectId;
  previousCSOId?: Types.ObjectId;
}

export interface IChatSession extends Document {
  type: "general" | "request_linked";
  status: "waiting" | "active" | "closed" | "reassigned";

  // Participants
  customer: Types.ObjectId;
  assignedCSO?: Types.ObjectId;

  // Linked context (only for request_linked sessions)
  freightRequest?: Types.ObjectId;
  booking?: Types.ObjectId;

  // Queue
  queuePosition: number;

  // Metadata
  metadata: IChatSessionMetaData;

  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
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
  },
  { timestamps: true },
);

chatSessionSchema.index({ status: 1, createdAt: 1 });
chatSessionSchema.index({ assignedCSO: 1, status: 1 });
chatSessionSchema.index({ customer: 1, status: 1 });

const ChatSession = model<IChatSession>("ChatSession", chatSessionSchema);
export default ChatSession;
