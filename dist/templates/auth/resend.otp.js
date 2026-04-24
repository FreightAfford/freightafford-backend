const RESEND_OTP_EMAIL_VERIFICATION_TEMPLATE = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your New Verification Code</title>
  <style type="text/css">
    body { margin: 0; padding: 0; min-width: 100%; background-color: #f9f9f9; font-family: 'Segoe UI', sans-serif; }
    table { border-spacing: 0; font-family: sans-serif; color: #333333; }
    td { padding: 0; }
    img { border: 0; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f9f9f9; padding-bottom: 40px; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: sans-serif; color: #333333; border-radius: 8px; overflow: hidden; }
    .header { background-color: #1E90FF; padding: 40px 20px; text-align: center; }
    .content { padding: 40px 30px; line-height: 1.6; }
    .otp-box { background-color: #ffffff; padding: 25px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0; color: #111111; border: 2px solid #1E90FF; }
    .footer { background-color: #f4f4f4; padding: 30px; text-align: center; font-size: 12px; color: #888888; }
    .button-container { padding: 20px 0; text-align: center; }
    .button { background-color: #1E90FF; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; }
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
          <h2 style="margin-top: 0; color: #111111;">New Verification Code</h2>
          <p style="text-transform: capitalize;">Hello, {{USER_NAME}}</p>
          <p>As requested, here is your new verification code for <strong>Freight Afford</strong>. Please use this to complete your current action:</p>
          <table width="100%">
            <tr>
              <td class="otp-box">
                {{OTP}}
              </td>
            </tr>
          </table>
          <p>This code is valid for {{OTP_EXPIRY}} minutes. If you did not request a new code, please ensure your account security is up to date.</p>
          <p>Best regards,<br>The Freight Afford Team</p>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td class="footer">
          <p style="margin: 0 0 10px 0;">&copy; {{FULL_YEAR}} Freight Afford. All rights reserved.</p>
          <p style="margin: 0;">Questions? Contact us at <a href="mailto:exports.ng@info.freightafford.com" style="color: #1E90FF; text-decoration: none;">exports.ng@info.freightafford.com</a></p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`;
export {};
//# sourceMappingURL=resend.otp.js.map