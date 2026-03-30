import { model, Schema } from "mongoose";
const amendmentSchema = new Schema({
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
}, { timestamps: true });
export const Amendment = model("Amendment", amendmentSchema);
//# sourceMappingURL=amendment.model.js.map