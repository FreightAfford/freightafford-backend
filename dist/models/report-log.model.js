import { Schema, model } from "mongoose";
// Durable record of which monthly reports were sent, so the startup catch-up
// doesn't resend them after a restart.
const reportLogSchema = new Schema({
    monthKey: { type: String, unique: true, required: true }, // "YYYY-MM"
    sentAt: { type: Date, default: Date.now },
}, { timestamps: true });
export const ReportLog = model("ReportLog", reportLogSchema);
//# sourceMappingURL=report-log.model.js.map