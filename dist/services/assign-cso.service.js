import { Ticket } from "../models/ticket.model.js";
import User from "../models/user.model.js";
import { resend } from "./email.service.js";
export const assignCso = async (ticketId) => {
    const csos = await User.find({ role: "admin", status: "active" });
    if (!csos.length)
        return null;
    const lastTicket = await Ticket.findOne({ assigned_to: { $ne: null } }).sort({
        createdAt: -1,
    });
    let nextCso = csos[0];
    if (lastTicket) {
        const lastIndex = csos.findIndex((user) => user._id.toString() === lastTicket.assigned_to?.toString());
        if (lastIndex >= 0)
            nextCso = csos[(lastIndex + 1) % csos.length];
    }
    await Ticket.findByIdAndUpdate(ticketId, { assigned_to: nextCso._id });
    const ticket = await Ticket.findById(ticketId);
    if (ticket && nextCso.email)
        await resend.emails.send({
            from: "FreightAfford Support <exports.ng@info.freightafford.com>",
            to: nextCso.email,
            subject: `[Assigned] ${ticket.ticket_id} - ${ticket.subject}`,
            text: `Hello ${nextCso.fullname || "Admin"}, 

      A new support ticket has been assigned to you.

Ticket ID: ${ticket.ticket_id}
Customer Email: ${ticket.customer_email}
Subject: ${ticket.subject}
Status: ${ticket.status}

Please login to the dashboard to respond.

FreightAfford Logistics.
      `,
        });
    return nextCso;
};
//# sourceMappingURL=assign-cso.service.js.map