import envConfig from "../configurations/env.configuration.js";
import SEND_PAYMENT_PROOF_TO_ADMIN from "../templates/invoice/payment.proof.js";
import SEND_UPLOAD_INVOICE_BY_ADMIN from "../templates/invoice/upload.invoice.js";
import VERIFY_PAYMENT_BY_ADMIN_TO_CUSTOMER from "../templates/invoice/verify.payment.js";
import { resend } from "./email.service.js";
export const sendUploadInvoiceNotification = async (email, fullname, invoiceNumber, amount, dueDate) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: "Invoice for payment",
        html: SEND_UPLOAD_INVOICE_BY_ADMIN.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{INVOICE_NUMBER}}", invoiceNumber)
            .replace("{{AMOUNT}}", amount.toLocaleString())
            .replace("{{DUE_DATE}}", dueDate.toDateString()),
    });
};
export const sendSubmitPaymentProofNotification = async (adminEmail, invoiceNumber, payReference, status) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: adminEmail,
        subject: "Payment Proof Submission",
        html: SEND_PAYMENT_PROOF_TO_ADMIN.replace("{{INVOICE_NUMBER}}", invoiceNumber)
            .replace("{{PAY_REFERENCE}}", payReference)
            .replace("{{STATUS}}", status.replace("_", " ")),
    });
};
export const sendVerifyPaymentNotification = async (email, fullname, action, invoiceNumber, status) => {
    return await resend.emails.send({
        from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
        to: email,
        subject: `Payment Verification Update`,
        html: VERIFY_PAYMENT_BY_ADMIN_TO_CUSTOMER.replace("{{USERNAME}}", fullname.split(" ")[0])
            .replace("{{COLOR}}", action === "approve" ? "#10b981" : "#ef4444")
            .replace("{{ACTION}}", action === "approve" ? "Approved" : "Rejected")
            .replace("{{INVOICE_NUMBER}}", invoiceNumber)
            .replace("{{STATUS}}", status.replace("_", " ")),
    });
};
//# sourceMappingURL=invoice.service.js.map