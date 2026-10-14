// Shared frame for business verification (KYC) emails, matching the look of
// the other Freight Afford emails. Callers must escape anything a user typed
// (see escapeHtml in services/kyc-email.service.ts).
export const kycEmailLayout = ({ title, heading, body, buttonText, buttonLink, }) => `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style type="text/css">
  body { margin: 0; padding: 0; min-width: 100%; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  table { border-spacing: 0; font-family: sans-serif; color: #333333; }
  td { padding: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding-bottom: 40px; padding-top: 40px; }
  .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #333333; border-radius: 12px; overflow: hidden; }
  .header { background-color: #0a2342; padding: 32px 20px; text-align: center; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 0.3px; }
  .content { padding: 40px; line-height: 1.6; }
  .footer { background-color: #f8fafc; padding: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  .button-container { padding: 24px 0 8px; text-align: center; }
  .button { background-color: #1e90ff; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; }
  .info-table { width: 100%; background-color: #f8fafc; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
  .info-td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top; }
  .info-label { font-weight: bold; color: #64748b; width: 40%; }
  .info-value { color: #1e293b; font-weight: 600; }
  h2 { color: #1e293b; font-size: 22px; margin-top: 0; margin-bottom: 20px; }
  p { margin-bottom: 15px; color: #475569; }
  </style>
</head>
<body>
  <center class="wrapper">
    <table class="main" width="100%">
      <tr><td class="header">Freightafford</td></tr>
      <tr>
        <td class="content">
          <h2>${heading}</h2>
          ${body}
          <table width="100%">
            <tr>
              <td class="button-container">
                <a href="${buttonLink}" class="button">${buttonText}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p style="margin: 0 0 10px 0; font-weight: 600;">&copy; ${new Date().getFullYear()} Freightafford. All rights reserved.</p>
          <p style="margin: 0 0 15px 0;">You received this email because of activity on your Freightafford account.</p>
          <p style="margin: 0;">Need help? <a href="mailto:exports.ng@info.freightafford.com" style="color: #0a2342; text-decoration: none; font-weight: 600;">Contact Support</a></p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`;
//# sourceMappingURL=layout.js.map