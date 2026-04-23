import { Schema, model } from "mongoose";
import type { IBooking } from "../utils/interface.js";

const bookingSchema = new Schema<IBooking>(
  {
    bookingNumber: { type: String, required: true, unique: true },
    freightRequest: {
      type: Schema.Types.ObjectId,
      ref: "FreightRequest",
      required: true,
    },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    shippingLine: {
      type: String,
      enum: ["Maersk", "CMA CGM", "MSC", "Hapag-Lloyd"],
      // required: true,
    },
    carrierBookingNumber: { type: String, unique: true, sparse: true },
    vessel: { type: String },
    sailingDate: { type: Date },
    status: {
      type: String,
      enum: [
        "awaiting_confirmation",
        "confirmed",
        "in_transit",
        "arrived",
        "delivered",
        "cancelled",
      ],
      default: "awaiting_confirmation",
    },
    containers: { type: [String], default: [] },
  },
  { timestamps: true },
);

const Booking = model("Booking", bookingSchema);
export default Booking;
