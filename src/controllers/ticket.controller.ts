import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import AppError from "../errors/app.error.js";
import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import { replyToTicket } from "../services/reply-to-ticket.service.js";
import ApiFeatures from "../utils/api-features.js";
import type { AuthenticateRequest } from "../utils/interface.js";
import { allowedTicketFilters } from "../utils/whitelists.js";

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
    req.user.fullname,
    message,
    files || [],
  );

  return res.status(200).json({ status: "success", data: reply });
};

export const getAllTickets = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const baseFilter = {};

  const totalAll = await Ticket.countDocuments(baseFilter);

  const countFeatures = new ApiFeatures(Ticket.find(baseFilter), req.query)
    .filter(allowedTicketFilters)
    .search(["ticket_id", "customer_email", "subject"]);

  const total = await countFeatures.query.countDocuments();

  const baseQuery = Ticket.find(baseFilter).populate("assigned_to", "fullname");

  const features = new ApiFeatures(baseQuery, req.query)
    .filter(allowedTicketFilters)
    .search(["ticket_id", "customer_email", "subject"])
    .sort()
    .limitFields()
    .paginate();

  const tickets = await features.query;

  res.status(200).json({
    status: "success",
    results: tickets.length,
    total,
    totalAll,
    page: Number(req.query.page) || 1,
    data: tickets,
  });
};

export const getSingleTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { ticketId } = req.params;

  if (!Types.ObjectId.isValid(ticketId as unknown as Types.ObjectId))
    return next(new AppError("Invalid ticket id", 400));

  const ticket = await Ticket.findById(ticketId).populate(
    "assigned_to",
    "fullname email role",
  );

  if (!ticket) return next(new AppError("Ticket not found", 404));

  const messages = await TicketMessage.find({ ticket_id: ticket._id })
    .populate("created_by", "fullname email role")
    .sort({ createdAt: 1 });

  res.status(200).json({ status: "success", data: { ticket, messages } });
};

export const updateTicketStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { ticketId } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["open", "pending", "resolved", "closed"];

  if (!allowedStatuses.includes(status))
    return next(new AppError("Invalid ticket status", 400));

  const ticket = await Ticket.findByIdAndUpdate(
    ticketId,
    {
      status,
      last_message_at: new Date(),
    },
    { new: true },
  );

  if (!ticket) return next(new AppError("Ticket not found", 404));

  return res.status(200).json({
    status: "success",
    message: `Support Ticket is ${ticket.status}`,
    data: ticket,
  });
};
