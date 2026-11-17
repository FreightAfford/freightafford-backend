import { Schema, model } from "mongoose";
import { RATE_CONTAINER_SIZES } from "../utils/interface.js";
import { portSchema } from "./rate.model.js";
// A customer asking for a contract rate on a lane that has none (for their
// commodity, or for the size they need). Admin is emailed; saving a matching
// rate resolves it and emails the customer, or admin marks it resolved.
const rateRequestSchema = new Schema({
    origin: { type: portSchema, required: true },
    destination: { type: portSchema, required: true },
    commodity: {
        type: new Schema({
            code: { type: String, required: true, trim: true },
            name: { type: String, required: true, trim: true },
        }, { _id: false }),
        required: true,
    },
    containerSize: { type: String, enum: RATE_CONTAINER_SIZES },
    note: { type: String, trim: true, maxlength: 500 },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Kept as they were when asked, for the admin list and emails.
    customerName: { type: String, required: true, trim: true },
    customerCompany: { type: String, trim: true },
    customerEmail: { type: String, required: true, trim: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    // The rate that answered it, when one did.
    resolvedByRate: { type: Schema.Types.ObjectId, ref: "Rate" },
}, { timestamps: true });
rateRequestSchema.index({ status: 1, createdAt: -1 });
rateRequestSchema.index({ customer: 1, status: 1 });
// Open requests a saved rate answers: same lane.
rateRequestSchema.index({
    status: 1,
    "origin.code": 1,
    "destination.code": 1,
});
const RateRequest = model("RateRequest", rateRequestSchema);
export default RateRequest;
//# sourceMappingURL=rate-request.model.js.map