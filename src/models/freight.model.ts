import { Schema, model } from "mongoose";
import type { IFreightRequest } from "../utils/interface.js";

const freightRequestSchema = new Schema<IFreightRequest>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    originPort: { type: String, required: true, trim: true },
    destinationPort: { type: String, required: true, trim: true },
    commodity: { type: String, required: true, trim: true },
    cargoWeight: { type: Number, required: true, min: 0 },
    cargoReadyDate: { type: Date, required: true },
    proposedPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    adminCounterPrice: { type: Number, min: 0 },
    counterReason: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "countered", "accepted", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    containerSize: {
      type: String,
      enum: ["20ft Std", "40ft Std", "40ft HC", "45ft HC"],
      required: true,
    },
    containerQuantity: { type: Number, required: true, min: 1 },
    adminActionAt: Date,
    customerDecisionAt: Date,
  },
  { timestamps: true },
);

const FreightRequest = model<IFreightRequest>(
  "FreightRequest",
  freightRequestSchema,
);

export default FreightRequest;
