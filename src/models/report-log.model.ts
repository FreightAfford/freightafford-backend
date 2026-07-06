import { Schema, model } from "mongoose";

// Durable record of which monthly reports have already been sent. Persisted in
// MongoDB (not the local filesystem) so the "already sent" state survives server
// restarts and redeploys on ephemeral hosts — otherwise the startup catch-up
// resends the previous month's report on every boot.
const reportLogSchema = new Schema(
  {
    // `YYYY-MM` of the reported month, e.g. "2026-06".
    monthKey: { type: String, unique: true, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const ReportLog = model("ReportLog", reportLogSchema);
