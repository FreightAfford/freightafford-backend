import type { NextFunction, Response } from "express";
import { replyToTicket } from "../services/reply-to-ticket.service.js";
import type { AuthenticateRequest } from "../utils/interface.js";

export const replyTicketMessage = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { ticketId } = req.params;
  const { message } = req.body;

  const files = req.files as Express.Multer.File[] | undefined;

  const reply = await replyToTicket(
    ticketId as string,
    req.user._id,
    message,
    files || [],
  );

  return res.status(200).json({ status: "success", data: reply });
};
