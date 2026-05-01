import { Types } from "mongoose";
import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import { uploadToCloudinary } from "../utils/upload-to-cloudinary.js";
import { resend } from "./email.service.js";

export const replyToTicket = async (
  ticketId: string,
  adminUserId: Types.ObjectId,
  adminFullName: string,
  message: string,
  files: Express.Multer.File[] = [],
) => {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) throw new Error("Ticket not found");

  const uploadedAttachments: any[] = [];

  for (const file of files) {
    const uploaded: any = await uploadToCloudinary(file, "attachments");

    uploadedAttachments.push({
      filename: file.originalname,
      url: uploaded.secure_url,
      size: file.size,
      content_type: file.mimetype,
    });
  }
  const subject = `Re: [${ticket.ticket_id}] ${ticket.subject}`;

  const { data, error } = await resend.emails.send({
    from: "FreightAfford Support <exports.ng@info.freightafford.com>",
    to: ticket.customer_email,
    subject,
    text: message,
    html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Message Regarding Ticket #${ticket.ticket_id}</title>
  <style type="text/css">
  body { margin: 0; padding: 0; min-width: 100%; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  table { border-spacing: 0; font-family: sans-serif; color: #333333; }
  td { padding: 0; }
  img { border: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding-bottom: 40px; padding-top: 40px; }
  .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: sans-serif; color: #333333; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
  .header { background-color: #0f172a; padding: 40px 20px; text-align: center; }
  .content { padding: 40px 40px; line-height: 1.6; }
  .footer { background-color: #f8fafc; padding: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  .button-container { padding: 30px 0; text-align: center; }
  .button { background-color: #0f172a; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; }
  .info-table { width: 100%; background-color: #f8fafc; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
  .info-td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .info-label { font-weight: bold; color: #64748b; width: 40%; }
  .info-value { color: #1e293b; font-weight: 600; }
  h2 { color: #1e293b; font-size: 22px; margin-top: 0; margin-bottom: 20px; }
  p { margin-bottom: 15px; color: #475569; }
</style>
</head>
<body>
  <center class="wrapper">
    <table class="main" width="100%">
      
  <tr>
    <td class="header">
      <img src="https://picsum.photos/seed/freight/200/50" alt="Freight Afford" width="180" style="max-width: 180px; display: block; margin: 0 auto;">
    </td>
  </tr>

      <tr>
        <td class="content">
          <h2>Update on your support ticket</h2>
          <p>Hello ${ticket.customer_email},</p>
          <p>You have a new message from our support team regarding your ticket <strong>#${ticket.ticket_id}</strong>.</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #0f172a; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; color: #1e293b; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Message from ${adminFullName}:</p>
            <p style="margin: 0; color: #475569; white-space: pre-wrap;">${message}</p>
          </div>

          <table class="info-table">
            <tr>
              <td class="info-td info-label">Ticket ID</td>
              <td class="info-td info-value">#${ticket.ticket_id}</td>
            </tr>
            <tr>
              <td class="info-td info-label" style="border-bottom: none;">Current Status</td>
              <td class="info-td info-value" style="border-bottom: none;">
                <span style="background-color: #fef9c3; color: #854d0e;  padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Awaiting Response</span>
              </td>
            </tr>
          </table>

          <p>If you have any further questions related to the issue you are having, you can reply directly to this email.</p>
                   
          <p>Regards,<br/>The Freight Afford Support Team</p>
        </td>
      </tr>
      
  <tr>
    <td class="footer">
      <p style="margin: 0 0 10px 0; font-weight: 600;">&copy; 2026 Freight Afford. All rights reserved.</p>
      <p style="margin: 0 0 15px 0;">You received this email because an action was performed on your account.</p>
    </td>
  </tr>

    </table>
  </center>
</body>
</html>
`,
    attachments: uploadedAttachments.map((file) => ({
      filename: file.filename,
      path: file.url,
    })),
  });

  if (error) throw new Error(error.message);

  const saveTicketMessage = await TicketMessage.create({
    ticket_id: ticket._id,
    sender_email: "exports.ng@info.freightafford.com",
    direction: "outbound",
    subject,
    content: message,
    attachments: uploadedAttachments,
    created_by: adminUserId,
    provider_email_id: data?.id || null,
    message_id: null,
  });

  await Ticket.findByIdAndUpdate(ticketId, {
    status: "pending",
    last_message_at: new Date(),
  });

  return saveTicketMessage;
};
