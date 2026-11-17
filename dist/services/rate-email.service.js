import { APP_URL, FROM, button, details, emailLayout, escapeHtml, formatDate, greeting, paragraph, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
import { ADMIN_RECIPIENTS } from "./freight.service.js";
// Contract rate emails. Each returns Resend's `{ error }`; callers log a
// failure and carry on, since the request or rate is already saved.
const portLabel = (port) => `${port.city}, ${port.country} (${port.code})`;
/** To the team, when a customer asks for a rate on a lane. */
export const sendRateRequestAdminEmail = (request) => {
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
            body: paragraph(`${customer} has no contract rate for this lane and asked us for one.`) +
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
// The customer Rates page opened on a lane (and on the month a later rate
// starts in), as its URL reads it.
const laneLink = (origin, destination, startsOn) => {
    const params = new URLSearchParams({
        from: origin.code,
        fromName: `${origin.city}, ${origin.country}`,
        to: destination.code,
        toName: `${destination.city}, ${destination.country}`,
        ...(startsOn && { month: startsOn.slice(0, 7) }),
    });
    return `${APP_URL}/app/customer/rates?${params}`;
};
/** To a customer, when saved rates answer one or more of their requests. */
export const sendRateReadyEmail = (to, answered) => {
    const first = answered[0];
    const oneLane = answered.every((a) => a.origin.code === first.origin.code && a.destination.code === first.destination.code);
    const lane = (a) => `${a.origin.city} → ${a.destination.city}`;
    return resend.emails.send({
        from: FROM(),
        to: to.email,
        subject: answered.length === 1
            ? `Your rate is ready: ${first.origin.code} → ${first.destination.code}`
            : `Your ${answered.length} rates are ready`,
        html: emailLayout({
            preheader: answered.map((a) => `${lane(a)}, ${a.commodity}`).join(" · "),
            status: ["Rate ready", "green"],
            heading: answered.length === 1 ? "The rate you asked for is ready" : "The rates you asked for are ready",
            body: paragraph(`${greeting(to.name)} we've added a contract rate for ${answered.length === 1 ? "the lane" : "the lanes"} you asked about.`) +
                answered
                    .map((a) => details([
                    ["Lane", escapeHtml(lane(a))],
                    ["Commodity", escapeHtml(a.commodity)],
                    ["Container", escapeHtml(a.containerSize)],
                    ["Valid from", a.startsOn ? formatDate(a.startsOn) : ""],
                ]))
                    .join("") +
                button(oneLane ? "View the rate" : "View rates", oneLane ? laneLink(first.origin, first.destination, first.startsOn) : `${APP_URL}/app/customer/rates`),
        }),
    });
};
//# sourceMappingURL=rate-email.service.js.map