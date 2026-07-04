import cron from "node-cron";
import { autoCloseStaleTickets } from "../../services/auto-close-ticket.service.js";
import { catchUpMonthlyReport, sendMonthlyReport } from "../monthly-report.js";
import {
  autoTransitSailedBookings,
  sendSailingReminders,
} from "../sailing-notifications.js";

export const registerCrons = () => {
  // On startup — recover the previous month's report if it was never sent
  // (covers downtime that spanned both the month-end run and the day-1 catch-up).
  (async () => {
    try {
      await catchUpMonthlyReport();
    } catch (err) {
      console.error("[cron] Monthly report catch-up failed with error:", err);
    }
  })();

  // Runs daily at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("[cron] Auto-transitioning sailed bookings...");
    await autoTransitSailedBookings();
  });

  // Daily at midnight — 7-day sailing reminders
  cron.schedule("0 0 * * *", async () => {
    console.log("[cron] Sending 7-day sailing reminders...");
    await sendSailingReminders();
  });

  // 11:59 PM on days 28–31 — fires only on the actual last day of the month
  cron.schedule("59 23 28-31 * *", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (tomorrow.getDate() === 1) {
      console.log("[cron] Sending monthly sailed report...");
      await sendMonthlyReport();
    }
  });

  // 00:30 on the 1st of each month — recover the previous month's report if the
  // month-end run above was missed (e.g. server down at 23:59 on the last day).
  cron.schedule("30 0 1 * *", async () => {
    console.log("[cron] Monthly report catch-up check...");
    await catchUpMonthlyReport();
  });

  cron.schedule("0 * * * *", async () => {
    console.log("[AutoClose] Running auto-close job...");
    try {
      await autoCloseStaleTickets();
    } catch (err) {
      console.error("[AutoClose] Job failed with error:", err);
    }
  });

  console.log("[cron] Jobs registered.");
};
