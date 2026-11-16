import type { IRatePort } from "../utils/interface.js";
import {
  APP_URL,
  FROM,
  button,
  details,
  emailLayout,
  escapeHtml,
  paragraph,
} from "../templates/email/layout.js";
import { resend } from "./email.service.js";
import { ADMIN_RECIPIENTS } from "./freight.service.js";

// Contract rate emails. Each returns Resend's `{ error }`; callers log a
// failure and carry on, since the request or rate is already saved.

const portLabel = (port: IRatePort) => `${port.city}, ${port.country} (${port.code})`;

/** To the team, when a customer asks for a rate on a lane. */
export const sendRateRequestAdminEmail = (request: {
  origin: IRatePort;
  destination: IRatePort;
  commodity: { code: string; name: string };
  containerSize?: string;
  note?: string;
  customerName: string;
  customerCompany?: string;
  customerEmail: string;
}) => {
  const customer = request.customerCompany
    ? `${escapeHtml(request.customerName)}, ${escapeHtml(request.customerCompany)}`
    : escapeHtml(request.customerName);

  return resend.emails.send({
    from: FROM(),
    to: ADMIN_RECIPIENTS,
    subject: `New rate request: ${request.origin.code} → ${request.destination.code}`,
    html: emailLayout({
      preheader: [request.customerName, request.commodity.name, request.containerSize ?? "Any size"].join(" · "),
      status: ["Rate request", "ochre"],
      heading: "A customer is asking for a rate",
      body:
        paragraph(`${customer} has no contract rate for this lane and asked us for one.`) +
        details([
          ["From", escapeHtml(portLabel(request.origin))],
          ["To", escapeHtml(portLabel(request.destination))],
          ["Commodity", escapeHtml(request.commodity.name)],
          ["Container", escapeHtml(request.containerSize ?? "Any size")],
          [
            "Customer",
            `${customer}<br><span style="font-weight:400;color:#3d4b5f;">${escapeHtml(request.customerEmail)}</span>`,
          ],
          ["Note", escapeHtml(request.note ?? "")],
        ]) +
        button("View rate requests", `${APP_URL}/app/admin/rates?tab=requests`),
    }),
  });
};
