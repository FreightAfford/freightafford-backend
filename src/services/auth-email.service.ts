import envConfig from "../configurations/env.configuration.js";
import OTP_EMAIL_VERIFICATION_TEMPLATE from "../templates/auth/otp.js";
import PASSWORD_RESET_TEMPLATE from "../templates/auth/password.reset.js";
import { resend } from "./email.service.js";

export const sendOTPEmail = async (
  email: string,
  fullname: string,
  otp: string,
  expiry: number,
) => {
  return resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "OTP / Email Verification",
    html: OTP_EMAIL_VERIFICATION_TEMPLATE.replace(
      "{{USER_NAME}}",
      fullname.split(" ")[0]!,
    )
      .replace("{{FULL_YEAR}}", new Date().getFullYear().toString())
      .replace("{{OTP}}", otp)
      .replace("{{OTP_EXPIRY}}", expiry.toString()),
  });
};

export const resendOTPEmail = async (
  email: string,
  fullname: string,
  otp: string,
  expiry: number,
) => {
  return resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Resend OTP / Email Verification",
    html: OTP_EMAIL_VERIFICATION_TEMPLATE.replace(
      "{{USER_NAME}}",
      fullname.split(" ")[0]!,
    )
      .replace("{{FULL_YEAR}}", new Date().getFullYear().toString())
      .replace("{{OTP}}", otp)
      .replace("{{OTP_EXPIRY}}", expiry.toString()),
  });
};

export const passwordResetEmail = async (
  email: string,
  fullname: string,
  resetLink: string,
  expiry: number,
) => {
  return resend.emails.send({
    from: `Freight Afford <${envConfig.RESEND_EMAIL}>`,
    to: email,
    subject: "Password Reset Request",
    html: PASSWORD_RESET_TEMPLATE.replace(
      "{{USER_NAME}}",
      fullname.split(" ")[0]!,
    )
      .replace("{{FULL_YEAR}}", new Date().getFullYear().toString())
      .replace("{{RESET_LINK}}", resetLink)
      .replace("{{RESET_EXPIRY}}", expiry.toString()),
  });
};
