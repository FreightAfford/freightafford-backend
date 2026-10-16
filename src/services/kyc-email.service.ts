import envConfig from "../configurations/env.configuration.js";
import User from "../models/user.model.js";
import {
  FROM,
  button,
  details,
  emailLayout,
  escapeHtml,
  greeting,
  paragraph,
  reason as reasonNote,
} from "../templates/email/layout.js";
import { resend } from "./email.service.js";

// Business verification (KYC) emails. Each returns Resend's `{ error }`.

const APP = () => envConfig.CLIENT_URL ?? "https://freightafford.com";

export { escapeHtml };

const business = (name: string) => `<strong style="color:#0f172b;">${escapeHtml(name)}</strong>`;

/** To the customer, right after they submit. */
export const sendKycReceivedEmail = (
  to: { email: string; fullname: string },
  businessName: string,
) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "We've received your business details",
    html: emailLayout({
      preheader: "We'll email you when it's done.",
      status: ["In review", "blue"],
      heading: "Your details are with our team",
      body:
        paragraph(`${greeting(to.fullname)} we're checking the details for ${business(businessName)}. We'll email you when it's done.`) +
        button("View verification", `${APP()}/app/customer/verification`),
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

  const accountType = application.accountType === "exporter" ? "Exporter" : "Export agent";
  return resend.emails.send({
    from: FROM(),
    // The rest are bcc'd, so the team's addresses aren't all shown.
    to: recipients[0]!,
    ...(recipients.length > 1 && { bcc: recipients.slice(1) }),
    subject: `New business verification: ${application.businessName}`,
    html: emailLayout({
      preheader: `${application.applicantName} · ${accountType}`,
      status: ["To review", "ochre"],
      heading: "A business is waiting for verification",
      body:
        details([
          ["Business", escapeHtml(application.businessName)],
          ["Account type", accountType],
          [
            "Submitted by",
            `${escapeHtml(application.applicantName)}<br><span style="font-weight:400;color:#3d4b5f;">${escapeHtml(application.applicantEmail)}</span>`,
          ],
        ]) +
        button("Review now", `${APP()}/app/admin/verifications/${encodeURIComponent(application.id)}`),
    }),
  });
};

type Recipient = { email: string; fullname: string };
const VERIFY_LINK = () => `${APP()}/app/customer/verification`;

/** To the customer: verified, live tracking is open. */
export const sendKycApprovedEmail = (to: Recipient, businessName: string) =>
  resend.emails.send({
    from: FROM(),
    to: to.email,
    subject: "Your business is verified",
    html: emailLayout({
      preheader: "Live tracking is now open.",
      status: ["Verified", "green"],
      heading: "Your business is verified",
      body:
        paragraph(`${greeting(to.fullname)} ${business(businessName)} is now verified. Live tracking is open on all your bookings.`) +
        button("View bookings", `${APP()}/app/customer/bookings`),
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
    html: emailLayout({
      preheader: notes.map((n) => n.label).join(", "),
      status: ["Changes needed", "ochre"],
      heading: "A few changes are needed",
      body:
        paragraph(`${greeting(to.fullname)} please update the following for ${business(businessName)}:`) +
        details(
          notes.map(({ label, note }) => [label, `<span style="font-weight:400;">${escapeHtml(note)}</span>`]),
        ) +
        button("Make the changes", VERIFY_LINK()),
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
    html: emailLayout({
      preheader: reason,
      status: ["Not verified", "red"],
      heading: "We couldn't verify your business",
      body:
        paragraph(`${greeting(to.fullname)} we weren't able to verify ${business(businessName)}.`) +
        reasonNote("red", reason) +
        button("View details", VERIFY_LINK()),
    }),
  });
