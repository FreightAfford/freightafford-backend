import { Schema, model } from "mongoose";
const bookingSchema = new Schema({
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
    vesselImo: { type: String },
    sailingDate: { type: Date },
    eta: { type: Date },
    // Last Maersk Track & Trace sync. status "ok" means Maersk events drive
    // this booking's dates and status instead of the sailing-date job.
    maerskSync: {
        status: { type: String, enum: ["ok", "not_found", "error"] },
        lastSyncedAt: { type: Date },
        reference: { type: String },
        departedAt: { type: Date },
        arrivedAt: { type: Date },
    },
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
}, { timestamps: true });
const Booking = model("Booking", bookingSchema);
export default Booking;
//# sourceMappingURL=booking.model.js.map