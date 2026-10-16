// ─── Chat Session Email Notification ─────────────────────────────────────────
//
// Sent to all CSO email addresses the moment a customer initiates a chat.
// Follows the exact same pattern as sendAdminFreightRequestNotification.
// ─────────────────────────────────────────────────────────────────────────────
import { APP_URL, FROM, button, details, emailLayout, escapeHtml, route, titleCase, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
export const sendChatInitiatedNotification = async (payload) => {
    const { customerName, customerEmail, sessionType, originPort, destinationPort, commodity, } = payload;
    const name = titleCase(customerName) || "A customer";
    const linked = sessionType === "request_linked";
    const html = emailLayout({
        preheader: customerEmail,
        status: ["Waiting", "ochre"],
        heading: `${name} is waiting to chat`,
        body: details([
            ["Customer", escapeHtml(name)],
            ["Email", escapeHtml(customerEmail)],
            linked && commodity ? ["Commodity", escapeHtml(titleCase(commodity))] : null,
        ]) +
            (linked ? route({ originPort, destinationPort }) : "") +
            button("Open chat", `${APP_URL}/app/admin/chats`),
    });
    return await resend.emails.send({
        from: FROM(),
        to: [
            "freightaffords@gmail.com",
            "devfranklinandrew@gmail.com",
            "alonsokelvin1@gmail.com",
            "chiamaka.k@ewebalinternational.ng",
        ],
        subject: `New chat: ${name} is waiting`,
        html,
    });
};
//# sourceMappingURL=chat-notification.service.js.map