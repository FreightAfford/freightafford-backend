import { APP_URL, FROM, SUPPORT_EMAIL, button, details, emailLayout, escapeHtml, formatDate, formatMoney, greeting, paragraph, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
export const sendUploadInvoiceNotification = async (email, fullname, invoiceNumber, amount, dueDate, invoice = {}) => {
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: `Invoice ${invoiceNumber}: ${formatMoney(amount)}`,
        html: emailLayout({
            preheader: `Due ${formatDate(dueDate)}`,
            reference: ["Invoice", invoiceNumber],
            status: ["Payment due", "ochre"],
            heading: "You have a new invoice",
            body: paragraph(`${greeting(fullname)} please pay by the due date to avoid delays.`) +
                details([
                    ["Amount due", formatMoney(amount), { big: true, mono: true }],
                    ["Due date", formatDate(dueDate)],
                    ["Booking", escapeHtml(invoice.bookingNumber ?? ""), { mono: true }],
                    ["Description", escapeHtml(invoice.description ?? "")],
                ]) +
                button("Pay invoice", `${APP_URL}/app/customer/invoices`),
        }),
    });
};
export const sendSubmitPaymentProofNotification = async (adminEmail, invoiceNumber, payReference, status, invoice = {}) => {
    return await resend.emails.send({
        from: FROM(),
        to: adminEmail,
        subject: `Payment proof submitted: ${invoiceNumber}`,
        html: emailLayout({
            preheader: `Ref ${payReference}`,
            reference: ["Invoice", invoiceNumber],
            status: ["To verify", "ochre"],
            heading: "Payment proof to verify",
            body: paragraph(`${invoice.customerName ? escapeHtml(invoice.customerName) : "A customer"} uploaded proof of payment.`) +
                details([
                    ["Amount", formatMoney(invoice.amount), { mono: true }],
                    ["Payment reference", escapeHtml(payReference), { mono: true }],
                    ["Invoice", escapeHtml(invoiceNumber), { mono: true }],
                ]) +
                button("Verify payment", `${APP_URL}/app/admin/invoices`),
        }),
    });
};
export const sendVerifyPaymentNotification = async (email, fullname, action, invoiceNumber, status, invoice = {}) => {
    const approved = action === "approve";
    return await resend.emails.send({
        from: FROM(),
        to: email,
        subject: approved
            ? `Payment confirmed: ${invoiceNumber}`
            : `Payment not confirmed: ${invoiceNumber}`,
        html: emailLayout({
            preheader: approved
                ? invoice.amount
                    ? `${formatMoney(invoice.amount)} received`
                    : "Payment received"
                : "Please contact us about this payment.",
            reference: ["Invoice", invoiceNumber],
            status: approved ? ["Paid", "green"] : ["Not confirmed", "red"],
            heading: approved ? "Payment confirmed" : "We couldn't confirm your payment",
            body: approved
                ? paragraph(`${greeting(fullname)} we've received your payment. Thank you.`) +
                    details([
                        ["Amount", formatMoney(invoice.amount), { big: true, mono: true }],
                        ["Paid on", formatDate(invoice.paidAt)],
                        ["Payment reference", escapeHtml(invoice.paymentReference ?? ""), { mono: true }],
                    ]) +
                    button("View booking", `${APP_URL}/app/customer/bookings`)
                : // A rejected invoice can't take a new proof upload, so point to support.
                    paragraph(`${greeting(fullname)} we couldn't match your proof of payment to this invoice. Please contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#0f5bb0;font-weight:600;">${SUPPORT_EMAIL}</a> so we can sort it out.`) +
                        details([
                            ["Amount due", formatMoney(invoice.amount), { mono: true }],
                            ["Due date", formatDate(invoice.dueDate)],
                        ]) +
                        button("View invoices", `${APP_URL}/app/customer/invoices`),
        }),
    });
};
//# sourceMappingURL=invoice.service.js.map