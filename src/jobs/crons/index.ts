import cron from "node-cron";
import { autoCloseStaleTickets } from "../../services/auto-close-ticket.service.js";
import { sendMonthlyReport } from "../monthly-report.js";
import {
  autoTransitSailedBookings,
  sendSailingReminders,
} from "../sailing-notifications.js";

export const registerCrons = () => {
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
