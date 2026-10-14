import envConfig from "../configurations/env.configuration.js";
import User from "../models/user.model.js";
import { kycEmailLayout } from "../templates/kyc/layout.js";
import { resend } from "./email.service.js";

// Business verification (KYC) emails. Each returns Resend's `{ error }`.

const FROM = () => `Freightafford <${envConfig.RESEND_EMAIL}>`;
const APP = () => envConfig.CLIENT_URL ?? "https://freightafford.com";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const firstName = (fullname: string) =>
  escapeHtml((fullname.split(" ")[0] ?? "").replace(/^./, (c) => c.toUpperCase()));

const row = (label: string, value: string, last = false) => `
  <tr>
    <td class="info-td info-label"${last ? ' style="border-bottom: none;"' : ""}>${label}</td>
    <td class="info-td info-value"${last ? ' style="border-bottom: none;"' : ""}>${value}</td>
  </tr>`;

/** To the customer, right after they submit. */
export const sendKycReceivedEmail = (
  to: { email: string; fullname: string },
  businessName: string,
) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "We've received your business details",
    html: kycEmailLayout({
      title: "Verification received",
      heading: "Your details are with our team",
      body: `
        <p>Hello ${firstName(to.fullname)},</p>
        <p>Thanks for submitting the verification for <strong>${escapeHtml(businessName)}</strong>. Our team is checking your details and documents now.</p>
        <p>We'll email you as soon as it's done. You can book shipments once your business is verified.</p>`,
      buttonText: "View verification",
      buttonLink: `${APP()}/app/customer/verification`,
    }),
  });

/** To every active admin and CSO, when a business submits. */
export const sendKycNewSubmissionEmail = async (application: {
  id: string;
  businessName: string;
  accountType: string;
  applicantName: string;
  applicantEmail: string;
}) => {
  const staff = await User.find(
    { role: { $in: ["admin", "cso"] }, status: "active" },
    { email: 1 },
  ).lean();
  const recipients = staff.map((member) => member.email).filter(Boolean);
  if (recipients.length === 0) {
    console.warn("[kyc-email] no admin or CSO users to notify");
    return { error: null };
  }

  return resend.emails.send({
    from: FROM(),
    // The rest are bcc'd, so the team's addresses aren't all shown.
    to: recipients[0]!,
    ...(recipients.length > 1 && { bcc: recipients.slice(1) }),
    subject: `New business verification: ${application.businessName}`,
    html: kycEmailLayout({
      title: "New business verification",
      heading: "A business is waiting for verification",
      body: `
        <p>${escapeHtml(application.businessName)} has submitted its details and documents for review.</p>
        <table class="info-table">
          ${row("Business", escapeHtml(application.businessName))}
          ${row("Account type", application.accountType === "exporter" ? "Exporter" : "Export agent")}
          ${row("Submitted by", `${escapeHtml(application.applicantName)}<br/>${escapeHtml(application.applicantEmail)}`, true)}
        </table>`,
      buttonText: "Review now",
      buttonLink: `${APP()}/app/admin/verifications/${application.id}`,
    }),
  });
};

type Recipient = { email: string; fullname: string };
const VERIFY_LINK = () => `${APP()}/app/customer/verification`;

/** To the customer: verified, they can book. */
export const sendKycApprovedEmail = (to: Recipient, businessName: string) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "Your business is verified",
    html: kycEmailLayout({
      title: "Business verified",
      heading: "Your business is verified",
      body: `
        <p>Hello ${firstName(to.fullname)},</p>
        <p>Good news: <strong>${escapeHtml(businessName)}</strong> is now verified on Freightafford.</p>
        <p>You can send freight requests and book shipments straight away. If any of your documents expire, we'll ask you to upload a new one.</p>`,
      buttonText: "Start booking",
      buttonLink: `${APP()}/app/customer/requests`,
    }),
  });

/** To the customer: what to fix, field by field. Labels and notes are plain text. */
export const sendKycChangesEmail = (
  to: Recipient,
  businessName: string,
  notes: { label: string; note: string }[],
) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "We need a few changes to verify your business",
    html: kycEmailLayout({
      title: "Changes needed",
      heading: "A few changes are needed",
      body: `
        <p>Hello ${firstName(to.fullname)},</p>
        <p>Our team reviewed the details for <strong>${escapeHtml(businessName)}</strong> and needs you to update the following before we can verify your business:</p>
        <table class="info-table">
          ${notes.map(({ label, note }, i) => row(escapeHtml(label), escapeHtml(note), i === notes.length - 1)).join("")}
        </table>
        <p>Your other details are saved. Update these and submit again.</p>`,
      buttonText: "Make the changes",
      buttonLink: VERIFY_LINK(),
    }),
  });

/** To the customer: rejected, with the reviewer's reason. */
export const sendKycRejectedEmail = (
  to: Recipient,
  businessName: string,
  reason: string,
) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "We couldn't verify your business",
    html: kycEmailLayout({
      title: "Verification unsuccessful",
      heading: "We couldn't verify your business",
      body: `
        <p>Hello ${firstName(to.fullname)},</p>
        <p>We weren't able to verify <strong>${escapeHtml(businessName)}</strong>.</p>
        <table class="info-table">
          ${row("Reason", escapeHtml(reason), true)}
        </table>
        <p>If you think this is a mistake, or want to know what's needed, contact our support team.</p>`,
      buttonText: "View details",
      buttonLink: VERIFY_LINK(),
    }),
  });
