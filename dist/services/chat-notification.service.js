// ─── Chat Session Email Notification ─────────────────────────────────────────
//
// Sent to all CSO email addresses the moment a customer initiates a chat.
// Follows the exact same pattern as sendAdminFreightRequestNotification.
// ─────────────────────────────────────────────────────────────────────────────
import envConfig from "../configurations/env.configuration.js";
import { resend } from "./email.service.js";
export const sendChatInitiatedNotification = async (payload) => {
    const { customerName, customerEmail, sessionType, originPort, destinationPort, commodity, } = payload;
    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Chat Session Notification</title>
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
          <h2>New Chat Session</h2>
          <p>Hello Support Team,</p>
          <p>A customer has initiated a support chat and is currently in the queue. Please log in to the CSO dashboard to respond.</p>
          
          <table class="info-table">
            <tr>
              <td class="info-td info-label">Customer</td>
              <td class="info-td info-value">${customerName.toUpperCase()}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Email</td>
              <td class="info-td info-value">${customerEmail}</td>
            </tr>
            
      ${sessionType === "request_linked"
        ? `<tr>
        <td class="info-td info-label">Shipment Route</td>
        <td class="info-td info-value">${originPort} &rarr; ${destinationPort}</td>
      </tr>
      <tr>
        <td class="info-td info-label" style="border-bottom: none;">Commodity</td>
        <td class="info-td info-value" style="border-bottom: none;">${commodity}</td>
      </tr>`
        : ""}
          </table>

          <p>Click the button below to open the Customer Service Officer (CSO) dashboard and connect with the customer.</p>
          
          <table width="100%">
            <tr>
              <td class="button-container">
                <a href="https://freightafford.com/app/admin/chats" class="button">Open CSO Dashboard</a>
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
    </td>
  </tr>

    </table>
  </center>
</body>
</html>

  `;
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: ["freightaffords@gmail.com", "devfranklinandrew@gmail.com"],
        subject: `New Chat Session — ${customerName.toUpperCase()} is waiting`,
        html,
    });
};
//# sourceMappingURL=chat-notification.service.js.map