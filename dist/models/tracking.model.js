import { model, Schema } from "mongoose";
const trackingEventSchema = new Schema({
    booking: {
        type: Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        index: true,
    },
    location: {
        originPort: { type: String, required: true },
        destinationPort: { type: String, required: true },
    },
    event: {
        type: String,
        enum: ["confirmed", "in_transit", "arrived", "delivered", "cancelled"],
        required: true,
    },
    description: { type: String, trim: true },
    eventDate: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
const TrackingEvent = model("TrackingEvent", trackingEventSchema);
export default TrackingEvent;
//# sourceMappingURL=tracking.model.js.map