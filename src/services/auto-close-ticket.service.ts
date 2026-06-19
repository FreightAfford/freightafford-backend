// services/auto-close-tickets.service.ts
import { Ticket } from "../models/ticket.model.js";
import { sendTicketClosedNotification } from "./send-ticket-closed-notification.service.js";

const INACTIVITY_HOURS = 12;
// Statuses eligible for auto-closure (open tickets with no reply, or pending tickets where customer never responded)
const CLOSEABLE_STATUSES = ["open", "pending"];

export const autoCloseStaleTickets = async (): Promise<void> => {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - INACTIVITY_HOURS);

  const staleTickets = await Ticket.find({
    status: { $in: CLOSEABLE_STATUSES },
    last_message_at: { $lte: cutoffDate },
  });

  if (!staleTickets.length) {
    console.log("[AutoClose] No stale tickets found.");
    return;
  }

  console.log(
    `[AutoClose] Found ${staleTickets.length} stale ticket(s). Closing...`,
  );

  const results = await Promise.allSettled(
    staleTickets.map(async (ticket) => {
      await Ticket.findByIdAndUpdate(ticket._id, { status: "closed" });

      await sendTicketClosedNotification(
        ticket.customer_email,
        ticket.ticket_id,
        ticket.subject,
      );

      console.log(
        `[AutoClose] Closed ticket #${ticket.ticket_id} for ${ticket.customer_email}`,
      );
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    console.error(
      `[AutoClose] ${failed.length} ticket(s) failed to close:`,
      failed,
    );
  }
};
