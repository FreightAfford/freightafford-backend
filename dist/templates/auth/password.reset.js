const PASSWORD_RESET_TEMPLATE = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password</title>
  <style type="text/css">
    body { margin: 0; padding: 0; min-width: 100%; background-color: #f9f9f9; font-family: 'Segoe UI',sans-serif; }
    table { border-spacing: 0; font-family: sans-serif; color: #333333; }
    td { padding: 0; }
    img { border: 0; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f9f9f9; padding-bottom: 40px; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: sans-serif; color: #333333; border-radius: 8px; overflow: hidden; }
    .header { background-color: #1E90FF; padding: 40px 20px; text-align: center; }
    .content { padding: 40px 30px; line-height: 1.6; }
    .footer { background-color: #f4f4f4; padding: 30px; text-align: center; font-size: 12px; color: #888888; }
    .button-container { padding: 20px 0; text-align: center; }
    .button { background-color: #1E90FF; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; }
  </style>
</head>
<body>
  <center class="wrapper">
    <table class="main" width="100%">
      <!-- Header -->
      <tr>
        <td class="header">
          <img src="https://picsum.photos/seed/logo/200/50" alt="Freight Afford" width="150" style="max-width: 150px; display: block; margin: 0 auto;">
        </td>
      </tr>
      <!-- Content -->
      <tr>
        <td class="content">
          <h2 style="margin-top: 0; color: #111111;">Password Reset Request</h2>
          <p style="text-transform: capitalize;">Hello, {{USER_NAME}}</p>
          <p>We received a request to reset the password for your <strong>Freight Afford</strong> account. Click the button below to choose a new password:</p>
          <table width="100%">
            <tr>
              <td class="button-container">
                <a href="{{RESET_LINK}}" class="button" target="_blank">Reset Password</a>
              </td>
            </tr>
          </table>
          <p>If you didn't request a password reset, you can safely ignore this email. Your password will not change until you access the link above and create a new one.</p>
          <p>For security, this link will expire in {{RESET_EXPIRY}} minutes.</p>
          <p>Best regards,<br>The Freight Afford Team</p>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td class="footer">
          <p style="margin: 0 0 10px 0;">&copy; {{FULL_YEAR}} Freight Afford. All rights reserved.</p>
          <p style="margin: 0;">Questions? Contact us at <a href="mailto:exports.ng@freightafford.com" style="color: #1E90FF; text-decoration: none;">exports.ng@freightafford.com</a></p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`;
export default PASSWORD_RESET_TEMPLATE;
//# sourceMappingURL=password.reset.js.map