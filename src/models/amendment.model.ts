import { model, Schema, Types } from "mongoose";

interface IAmendment {
  booking: Types.ObjectId;
  customer: Types.ObjectId;
  draftVersion: number;
  amendmentType: "text" | "pdf";
  content: string;
  fileUrl: string;
  filePublicId: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date;
  fileSize: number;
}

const amendmentSchema = new Schema<IAmendment>(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    draftVersion: { type: Number, required: true },
    amendmentType: { type: String, enum: ["text", "pdf"], required: true },
    content: { type: String },
    fileUrl: { type: String },
    filePublicId: { type: String },
    status: {
      type: String,
      enum: ["pending", "reviewed", "applied"],
      default: "pending",
    },
    reviewedAt: { type: Date },
    fileSize: { type: Number },
  },
  { timestamps: true },
);

export const Amendment = model("Amendment", amendmentSchema);
