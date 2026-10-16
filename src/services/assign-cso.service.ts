import { Types } from "mongoose";
import { Ticket } from "../models/ticket.model.js";
import User from "../models/user.model.js";
import {
  APP_URL,
  SUPPORT_FROM,
  button,
  details,
  emailLayout,
  escapeHtml,
  titleCase,
} from "../templates/email/layout.js";
import { resend } from "./email.service.js";

export const assignCso = async (ticketId: Types.ObjectId) => {
  const csos = await User.find({ role: "admin", status: "active" });

  if (!csos.length) return null;

  const lastTicket = await Ticket.findOne({ assigned_to: { $ne: null } }).sort({
    createdAt: -1,
  });

  let nextCso = csos[0];

  if (lastTicket) {
    const lastIndex = csos.findIndex(
      (user) => user._id.toString() === lastTicket.assigned_to?.toString(),
    );

    if (lastIndex >= 0) nextCso = csos[(lastIndex + 1) % csos.length];
  }

  await Ticket.findByIdAndUpdate(ticketId, { assigned_to: nextCso._id });

  const ticket = await Ticket.findById(ticketId);

  if (ticket && nextCso.email)
    await resend.emails.send({
      from: SUPPORT_FROM,
      to: nextCso.email,
      subject: `Assigned to you: [${ticket.ticket_id}] ${ticket.subject}`,
      text: `Hello ${titleCase(nextCso.fullname) || "Admin"},

A new support ticket has been assigned to you.

Ticket ID: ${ticket.ticket_id}
Customer: ${ticket.customer_email}
Subject: ${ticket.subject}
Status: ${ticket.status}

Open it here: ${APP_URL}/app/admin/tickets/${ticket._id}
`,
      html: emailLayout({
        preheader: ticket.customer_email,
        reference: ["Ticket", ticket.ticket_id],
        status: ["Assigned to you", "ochre"],
        heading: "A ticket was assigned to you",
        body:
          details([
            ["Subject", escapeHtml(ticket.subject)],
            ["Customer", escapeHtml(ticket.customer_email)],
            ["Status", escapeHtml(titleCase(ticket.status))],
          ]) + button("Open ticket", `${APP_URL}/app/admin/tickets/${ticket._id}`),
      }),
    });

  return nextCso;
};
