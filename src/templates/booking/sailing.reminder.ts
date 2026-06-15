// src/templates/booking/sailing.reminder.ts
const SAILING_REMINDER_TO_CUSTOMER = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sailing Reminder</title>
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
  .badge { display: inline-block; background-color: #fef9c3; color: #854d0e; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
  h2 { color: #1e293b; font-size: 22px; margin-top: 0; margin-bottom: 10px; }
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
          <span class="badge">⏳ Sailing in 7 Days</span>
          <h2>Your Shipment Sails Soon</h2>
          <p style="text-transform: capitalize;">Hello {{USERNAME}},</p>
          <p>This is a reminder that your shipment is scheduled to sail in <strong>7 days</strong>. Please ensure your cargo is ready and all documentation is in order before the sailing date.</p>

          <table class="info-table">
            <tr>
              <td class="info-td info-label">Booking Number</td>
              <td class="info-td info-value">{{BOOKING_NUMBER}}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Shipping Line</td>
              <td class="info-td info-value">{{SHIPPING_LINE}}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Vessel</td>
              <td class="info-td info-value">{{VESSEL}}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Origin Port</td>
              <td class="info-td info-value" style="text-transform: capitalize;">{{ORIGIN_PORT}}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Destination Port</td>
              <td class="info-td info-value" style="text-transform: capitalize;">{{DESTINATION_PORT}}</td>
            </tr>
            <tr>
              <td class="info-td info-label" style="border-bottom: none;">Sailing Date</td>
              <td class="info-td info-value" style="border-bottom: none; color: #0f172a; font-weight: 800;">{{SAILING_DATE}}</td>
            </tr>
          </table>

          <p>Log in to your dashboard to review your booking details and track your shipment.</p>
          <table width="100%">
            <tr>
              <td class="button-container">
                <a href="https://freightafford.com/app/customer" class="button">View Dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td class="footer">
          <p style="margin: 0 0 10px 0; font-weight: 600;">&copy; 2026 Freight Afford. All rights reserved.</p>
          <p style="margin: 0 0 15px 0;">You received this email because you have an active booking with us.</p>
          <p style="margin: 0;">Need help? <a href="mailto:exports.ng@info.freightafford.com" style="color: #0f172a; text-decoration: none; font-weight: 600;">Contact Support</a></p>
        </td>
      </tr>

    </table>
  </center>
</body>
</html>
`;

export default SAILING_REMINDER_TO_CUSTOMER;
