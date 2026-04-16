import { Schema, model } from "mongoose";
const freightRequestSchema = new Schema({
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
    originPort: { type: String, required: true, trim: true, lowercase: true },
    destinationPort: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    commodity: { type: String, required: true, trim: true, lowercase: true },
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
}, { timestamps: true });
const FreightRequest = model("FreightRequest", freightRequestSchema);
export default FreightRequest;
//# sourceMappingURL=freight.model.js.map