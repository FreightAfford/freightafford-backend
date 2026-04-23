import { Ticket } from "../models/ticket.model.js";
import User from "../models/user.model.js";
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
    return nextCso;
};
//# sourceMappingURL=assign-cso.service.js.map