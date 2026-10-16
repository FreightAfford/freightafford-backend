import { APP_URL, FROM, button, details, emailLayout, escapeHtml, formatDate, formatMoney, greeting, mono, paragraph, priceComparison, reason as reasonNote, route, titleCase, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
const ADMIN_RECIPIENTS = [
    "freightaffords@gmail.com",
    "devfranklinandrew@gmail.com",
    "alonsokelvin1@gmail.com",
    "chiamaka.k@ewebalinternational.ng",
];
/** "NGAPP → NLRTM", or the port names when a legacy request has no codes. */
const routeLabel = (r) => r.originPortCode && r.destinationPortCode
    ? `${r.originPortCode} → ${r.destinationPortCode}`
    : `${titleCase(r.originPort)} → ${titleCase(r.destinationPort)}`;
const containersLabel = (size, quantity) => size && quantity ? `${quantity} &times; ${escapeHtml(size)}` : "";
export const sendAdminFreightRequestNotification = async (request) => {
    const isBatch = request.quantity > 1;
    const dashboardLink = request.batchId
        ? `${APP_URL}/app/admin/requests?batchId=${encodeURIComponent(request.batchId)}`
        : `${APP_URL}/app/admin/requests`;
    const each = isBatch ? " (each)" : "";
    const customer = [request.customerName, request.customerEmail && `(${request.customerEmail})`]
        .filter(Boolean)
        .join(" ");
    const html = emailLayout({
        preheader: [request.customerName, titleCase(request.commodity), formatMoney(request.proposedPrice) + (isBatch ? " each" : "")]
            .filter(Boolean)
            .join(" · "),
        status: [isBatch ? `${request.quantity} requests` : "New request", "ochre"],
        heading: isBatch ? `New batch of ${request.quantity} requests` : "New freight request",
        body: paragraph(customer
            ? `${escapeHtml(customer)} submitted ${isBatch ? `${request.quantity} identical requests` : "a request"}.`
            : `A customer submitted ${isBatch ? `${request.quantity} identical requests` : "a request"}.`) +
            route(request, [
                [`Containers${each}`, containersLabel(request.containerSize, request.containerQuantity)],
                ["Cargo ready", formatDate(request.cargoReadyDate)],
            ]) +
            details([
                ["Commodity", escapeHtml(titleCase(request.commodity))],
                [`Cargo weight${each}`, `${request.cargoWeight.toLocaleString()} kg`],
                [`Proposed price${each}`, formatMoney(request.proposedPrice), { mono: true }],
            ]) +
            button(isBatch ? "Review batch" : "Review request", dashboardLink),
    });
    return await resend.emails.send({
        from: FROM(),
        to: ADMIN_RECIPIENTS,
        subject: isBatch
            ? `New batch: ${request.quantity} freight requests, ${routeLabel(request)}`
            : `New freight request: ${routeLabel(request)}`,
        html,
    });
};
export const sendCustomerAcceptedNotification = async (email, fullname, bookingNo, request = {}) => {
    // Same rule as the invoice and the booking page: the counter price wins.
    const agreedPrice = request.adminCounterPrice || request.proposedPrice;
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: `Request accepted: ${bookingNo}`,
        html: emailLayout({
            preheader: [route(request) && routeLabel(request), formatMoney(agreedPrice)].filter(Boolean).join(" · "),
            reference: ["Booking", bookingNo],
            status: ["Accepted", "green"],
            heading: "Your request is accepted",
            body: paragraph(`${greeting(fullname)} your booking number is ${mono(bookingNo)}. We'll send your invoice next.`) +
                route(request, [
                    ["Containers", containersLabel(request.containerSize, request.containerQuantity)],
                    ["Agreed price", formatMoney(agreedPrice)],
                ]) +
                button("View booking", `${APP_URL}/app/customer/bookings`),
        }),
    });
};
export const sendCustomerBatchAcceptedNotification = async (email, fullname, bookingNumbers, request = {}) => {
    const count = bookingNumbers.length;
    return await resend.emails.send({
        from: FROM(),
        to: [email],
        subject: `${count} freight requests accepted`,
        html: emailLayout({
            preheader: count > 1 ? `${bookingNumbers[0]} and ${count - 1} more` : bookingNumbers[0],
            status: [`${count} accepted`, "green"],
            heading: `Your ${count} requests are accepted`,
            body: paragraph(`${greeting(fullname)} each request now has its own booking number.`) +
                route(request) +
                details(bookingNumbers.map((num, i) => [`Booking ${i + 1}`, escapeHtml(num), { mono: true }])) +
                button("View bookings", `${APP_URL}/app/customer/bookings`),
        }),
    });
};
export const sendCustomerCounterNotification = async (email, fullname, price, reason, request = {}) => {
    const proposed = request.proposedPrice;
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: `Counter offer: ${formatMoney(price)}`,
        html: emailLayout({
            preheader: proposed ? `You proposed ${formatMoney(proposed)}.` : `Our offer: ${formatMoney(price)}`,
            status: ["Reply needed", "ochre"],
            heading: "We have a counter offer",
            body: paragraph(`${greeting(fullname)} we can't take your request at the proposed price. Here's what we can offer.`) +
                (typeof proposed === "number"
                    ? priceComparison(proposed, price)
                    : details([["Our offer", formatMoney(price), { mono: true, big: true }]])) +
                (reason ? reasonNote("blue", reason) : "") +
                route(request) +
                button("Respond to offer", `${APP_URL}/app/customer/requests`),
        }),
    });
};
export const sendCustomerRejectedNotification = async (email, fullname, reason, request = {}) => {
    const hasRoute = !!route(request);
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: hasRoute ? `Request not accepted: ${routeLabel(request)}` : "Freight request not accepted",
        html: emailLayout({
            preheader: reason,
            status: ["Not accepted", "red"],
            heading: "We can't take this request",
            body: paragraph(`${greeting(fullname)} we're unable to accept this request.`) +
                (reason ? reasonNote("red", reason) : "") +
                route(request) +
                button("Send a new request", `${APP_URL}/app/customer/requests`),
        }),
    });
};
export const sendAdminCustomerDecisionNotification = async (adminEmail, fullname, decision, request = {}) => {
    const accepted = decision === "accept";
    const name = titleCase(fullname) || "The customer";
    const offer = formatMoney(request.adminCounterPrice);
    return await resend.emails.send({
        from: FROM(),
        to: adminEmail,
        subject: `${name} ${accepted ? "accepted" : "declined"} the counter offer`,
        html: emailLayout({
            preheader: [route(request) && routeLabel(request), offer].filter(Boolean).join(" · "),
            status: [accepted ? "Accepted" : "Declined", accepted ? "green" : "red"],
            heading: `Customer ${accepted ? "accepted" : "declined"} the counter offer`,
            body: paragraph(`${escapeHtml(name)} ${accepted ? "accepted" : "declined"} ${offer ? `your offer of ${offer}` : "your counter offer"}.`) +
                route(request) +
                button("Open requests", `${APP_URL}/app/admin/requests`),
        }),
    });
};
//# sourceMappingURL=freight.service.js.map