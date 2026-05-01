import { Types } from "mongoose";
import { Ticket } from "../models/ticket.model.js";
import User from "../models/user.model.js";
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
      html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Support Ticket Assigned</title>
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
          <h2>New Support Ticket Assigned</h2>
          <p style='text-transform:capitalize'>Hello ${nextCso.fullname},</p>
          <p>A new support ticket has been assigned to you. Here are the details:</p>
          
          <table class="info-table">
            <tr>
              <td class="info-td info-label">Ticket ID</td>
              <td class="info-td info-value">#${ticket.ticket_id}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Customer Email</td>
              <td class="info-td info-value">${ticket.customer_email}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Subject</td>
              <td class="info-td info-value">${ticket.subject}</td>
            </tr>
            <tr>
              <td class="info-td info-label" style="border-bottom: none;">Status</td>
              <td class="info-td info-value" style="border-bottom: none;">
                <span style="background-color: #fef9c3; color: #854d0e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">OPEN</span>
              </td>
            </tr>
          </table>

          <p>Please login to the dashboard to respond to the customer as soon as possible.</p>
          
          <table width="100%">
            <tr>
              <td class="button-container">
                <a href="https://freightafford.com/dashboard" class="button">Go to Dashboard</a>
              </td>
            </tr>
          </table>
          
          <p>Regards,<br/>The Freight Afford System</p>
        </td>
      </tr>
      
  <tr>
    <td class="footer">
      <p style="margin: 0 0 10px 0; font-weight: 600;">&copy; 2026 Freight Afford. All rights reserved.</p>
      <p style="margin: 0 0 15px 0;">You received this email because an action was performed on your account.</p>
      <p style="margin: 0;">Need help? <a href="mailto:exports.ng@info.freightafford.com" style="color: #0f172a; text-decoration: none; font-weight: 600;">Contact Support</a></p>
    </td>
  </tr>

    </table>
  </center>
</body>
</html>
`,
    });

  return nextCso;
};
