import { Schema, model } from "mongoose";
import type { IInvoice } from "../utils/interface.js";

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },

    description: { type: String, required: true },

    amount: { type: Number, required: true },

    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    bookingNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },

    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // admin
      required: true,
    },

    documentUrl: {
      type: String,
      required: true,
    },

    documentPublicId: {
      type: String,
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "overdue", "awaiting_verification", "rejected"],
      default: "pending",
      index: true,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    paidAt: Date,

    paymentReference: String,
    paymentProofUrl: String,

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

const Invoice = model("Invoice", invoiceSchema);
export default Invoice;
