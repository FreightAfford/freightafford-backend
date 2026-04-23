import { Types } from "mongoose";
import { Ticket } from "../models/ticket.model.js";
import { extractTicketId } from "../utils/extract-ticket-id.js";
import { createTicket } from "./create-ticket.service.js";

export const findOrCreateTicket = async (email: any) => {
  const extractedId = extractTicketId(email.subject);

  if (extractedId) {
    const existing = await Ticket.findOne({ ticket_id: extractedId });

    if (existing) return { ticket: existing, isNew: false, threaded: true };
  }

  return await createTicket(email);
};

export const touchTicket = async (ticketId: Types.ObjectId) =>
  await Ticket.findByIdAndUpdate(ticketId, {
    status: "open",
    last_message_at: new Date(),
  });
