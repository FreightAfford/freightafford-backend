import { replyToTicket } from "../services/reply-to-ticket.service.js";
export const replyTicketMessage = async (req, res, next) => {
    const { ticketId } = req.params;
    const { message } = req.body;
    const files = req.files;
    const reply = await replyToTicket(ticketId, req.user._id, message, files || []);
    return res.status(200).json({ status: "success", data: reply });
};
//# sourceMappingURL=ticket.controller.js.map