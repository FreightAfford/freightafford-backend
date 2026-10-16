import { FROM, button, emailLayout, firstName, firstNameText, gap, linkFallback, otpCode, paragraph, smallPrint, } from "../templates/email/layout.js";
import { resend } from "./email.service.js";
const otpEmail = (fullname, otp, expiry, isResend) => emailLayout({
    preheader: `It expires in ${expiry} minutes.`,
    status: ["Verification", "blue"],
    heading: isResend
        ? "Your new code"
        : firstNameText(fullname)
            ? `Verify your email, ${firstNameText(fullname)}`
            : "Verify your email",
    body: paragraph(`Enter this code to verify your email. It expires in ${expiry} minutes.`) +
        otpCode(otp) +
        smallPrint("If you didn't request this, you can ignore this email."),
});
export const sendOTPEmail = async (email, fullname, otp, expiry) => {
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: `${otp} is your Freightafford code`,
        html: otpEmail(fullname, otp, expiry, false),
    });
};
export const resendOTPEmail = async (email, fullname, otp, expiry) => {
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: `${otp} is your Freightafford code`,
        html: otpEmail(fullname, otp, expiry, true),
    });
};
export const passwordResetEmail = async (email, fullname, resetLink, expiry) => {
    const name = firstName(fullname);
    return resend.emails.send({
        from: FROM(),
        to: email,
        subject: "Reset your Freightafford password",
        html: emailLayout({
            preheader: `This link expires in ${expiry} minutes.`,
            status: ["Password reset", "blue"],
            heading: "Reset your password",
            body: paragraph(`${name ? `Hi ${name}, use` : "Use"} the button below to choose a new password. The link expires in ${expiry} minutes.`) +
                button("Choose a new password", resetLink) +
                linkFallback(resetLink) +
                gap(18) +
                smallPrint("If you didn't ask for this, ignore this email. Your password won't change."),
        }),
    });
};
//# sourceMappingURL=auth-email.service.js.map