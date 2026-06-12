import { model, Schema } from "mongoose";
const billOfLadingSchema = new Schema({
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    bookingNumber: { type: String, required: true },
    type: {
        type: String,
        enum: [
            "house",
            "master",
            "release_order",
            "booking_confirmation",
            "draft_bill_of_lading",
            "original_bill_of_lading",
        ],
        required: true,
    },
    documentUrl: { type: String, required: true },
    documentPublicId: { type: String, required: true },
    status: {
        type: String,
        enum: ["drafted", "pending_amendment", "finalized"],
        default: "drafted",
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
    fileName: { type: String, required: true },
}, { timestamps: true });
const BillOfLading = model("BillOfLading", billOfLadingSchema);
export default BillOfLading;
//# sourceMappingURL=bl.model.js.map