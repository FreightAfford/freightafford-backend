import { Document, model, Schema, Types } from "mongoose";

interface IBillOfLading extends Document {
  booking: Types.ObjectId;
  bookingNumber: string;
  type: string;
  documentUrl: string;
  documentPublicId: string;
  status: string;
  version: number;
  uploadedBy: Types.ObjectId;
  fileSize: number;
  customer: Types.ObjectId;
  customerName: string;
}

const billOfLadingSchema = new Schema<IBillOfLading>(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    bookingNumber: { type: String, required: true },
    type: { type: String, enum: ["house", "master"], required: true },
    documentUrl: { type: String, required: true },
    documentPublicId: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "pending_amendment", "finalized"],
      default: "draft",
    },
    version: { type: Number, default: 1 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerName: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { timestamps: true },
);

const BillOfLading = model("BillOfLading", billOfLadingSchema);
export default BillOfLading;
