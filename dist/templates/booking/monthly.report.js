// src/templates/booking/monthly.report.ts
const MONTHLY_REPORT_TO_ADMIN = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Monthly Sailed Shipments Report</title>
  <style type="text/css">
  body { margin: 0; padding: 0; min-width: 100%; background-color: #f4f7f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  table { border-spacing: 0; font-family: sans-serif; color: #333333; }
  td { padding: 0; }
  img { border: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding-bottom: 40px; padding-top: 40px; }
  .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: sans-serif; color: #333333; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
  .header { background-color: #0f172a; padding: 40px 20px; text-align: center; }
  .content { padding: 40px; line-height: 1.6; }
  .footer { background-color: #f8fafc; padding: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  .badge { display: inline-block; background-color: #dcfce7; color: #166534; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
  .stat-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  .stat-td { padding: 16px; text-align: center; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .stat-number { font-size: 28px; font-weight: 800; color: #0f172a; display: block; }
  .stat-label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; display: block; }
  .info-table { width: 100%; background-color: #f8fafc; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
  .info-td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .info-label { font-weight: bold; color: #64748b; width: 40%; }
  .info-value { color: #1e293b; font-weight: 600; }
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
          <span class="badge">📊 Monthly Report</span>
          <h2>Sailed Shipments — {{MONTH_LABEL}}</h2>
          <p>Hello Team,</p>
          <p>Please find attached the sailed shipments report for <strong>{{MONTH_LABEL}}</strong>. Here is a quick summary:</p>

          <table class="stat-table">
            <tr>
              <td class="stat-td" style="width: 50%;">
                <span class="stat-number">{{TOTAL_SHIPMENTS}}</span>
                <span class="stat-label">Total Shipments</span>
              </td>
              <td style="width: 8px;"></td>
              <td class="stat-td" style="width: 50%;">
                <span class="stat-number">{{TOTAL_REVENUE}}</span>
                <span class="stat-label">Total Revenue</span>
              </td>
            </tr>
          </table>

          <table class="info-table">
            <tr>
              <td class="info-td info-label">Report Period</td>
              <td class="info-td info-value">{{MONTH_LABEL}}</td>
            </tr>
            <tr>
              <td class="info-td info-label">Generated On</td>
              <td class="info-td info-value">{{GENERATED_DATE}}</td>
            </tr>
            <tr>
              <td class="info-td info-label" style="border-bottom: none;">Report File</td>
              <td class="info-td info-value" style="border-bottom: none;">{{FILE_NAME}}</td>
            </tr>
          </table>

          <p>The full breakdown is available in the attached Excel file.</p>
          <p style="color: #94a3b8; font-size: 13px;">This is an automated report generated at the end of each month.</p>
        </td>
      </tr>

      <tr>
        <td class="footer">
          <p style="margin: 0 0 10px 0; font-weight: 600;">&copy; 2026 Freight Afford. All rights reserved.</p>
          <p style="margin: 0 0 15px 0;">This is an internal automated report for admin use only.</p>
          <p style="margin: 0;">Need help? <a href="mailto:exports.ng@info.freightafford.com" style="color: #0f172a; text-decoration: none; font-weight: 600;">Contact Support</a></p>
        </td>
      </tr>

    </table>
  </center>
</body>
</html>
`;
export default MONTHLY_REPORT_TO_ADMIN;
//# sourceMappingURL=monthly.report.js.map