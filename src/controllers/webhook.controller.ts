import type { NextFunction, Request, Response } from "express";
import envConfig from "../configurations/env.configuration.js";
import { assignCso } from "../services/assign-cso.service.js";
import { resend } from "../services/email.service.js";
import {
  findOrCreateTicket,
  touchTicket,
} from "../services/find-or-create-ticket.service.js";
import { saveInboundMessage } from "../services/save-inbound-message.service.js";
import { sendTicketAcknowledgement } from "../services/send-ticket-acknowledgement.service.js";
import { findThreadTicket } from "../utils/find-ticket-thread.js";
import { normalizeInboundEmail } from "../utils/normalize-inbound.js";

export const inboundWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payload = req.body;

    const result: any = resend.webhooks.verify({
      payload: JSON.stringify(payload),
      headers: {
        id: req.headers["svix-id"] as string,
        timestamp: req.headers["svix-timestamp"] as string,
        signature: req.headers["svix-signature"] as string,
      },
      webhookSecret: envConfig.RESEND_WEBHOOK_SECRET,
    });

    if (result.type !== "email.received")
      res
        .status(200)
        .json({ status: "success", ignored: true, type: result.type });

    const { data, error } = await resend.emails.receiving.get(
      result.data.email_id,
    );

    if (error) throw error;

    const email = normalizeInboundEmail(data);

    await findThreadTicket(email);

    const createdTicket = await findOrCreateTicket(email);

    const ticket = createdTicket.ticket;

    await saveInboundMessage(ticket, email);

    await touchTicket(ticket._id);

    if (createdTicket.isNew) {
      if (!ticket.assigned_to) await assignCso(ticket._id);

      await sendTicketAcknowledgement(
        ticket.customer_email,
        ticket.ticket_id,
        ticket.subject,
      );
    }

    console.dir(data, { depth: null });

    res
      .status(200)
      .json({ status: "success", message: "Inbound email received" });
  } catch (error) {
    next(error);
  }
};
