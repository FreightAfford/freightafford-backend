// Renders every email through a stubbed Resend client (nothing is sent) and
// checks the things that would be costly to get wrong: broken values, unescaped
// user input, changed recipients, lost attachments and ticket threading.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import TicketMessage from "../models/ticket-message.model.js";
import { Ticket } from "../models/ticket.model.js";
import User from "../models/user.model.js";
import { extractTicketId } from "../utils/extract-ticket-id.js";
import { assignCso } from "./assign-cso.service.js";
import { passwordResetEmail, resendOTPEmail, sendOTPEmail } from "./auth-email.service.js";
import {
  sendBillOfLadingNotification,
  sendBookingScheduleNotification,
  sendContainerNumbersNotification,
  sendMonthlyReportToAdmins,
  sendSailingReminderNotification,
  sendShipmentStatusUpdate,
} from "./booking.service.js";
import { sendChatInitiatedNotification } from "./chat-notification.service.js";
import { resend } from "./email.service.js";
import {
  sendAdminCustomerDecisionNotification,
  sendAdminFreightRequestNotification,
  sendCustomerAcceptedNotification,
  sendCustomerBatchAcceptedNotification,
  sendCustomerCounterNotification,
  sendCustomerRejectedNotification,
} from "./freight.service.js";
import {
  sendSubmitPaymentProofNotification,
  sendUploadInvoiceNotification,
  sendVerifyPaymentNotification,
} from "./invoice.service.js";
import {
  sendKycApprovedEmail,
  sendKycChangesEmail,
  sendKycNewSubmissionEmail,
  sendKycReceivedEmail,
  sendKycRejectedEmail,
} from "./kyc-email.service.js";
import { replyToTicket } from "./reply-to-ticket.service.js";
import { sendTicketAcknowledgement } from "./send-ticket-acknowledgement.service.js";
import { sendTicketClosedNotification } from "./send-ticket-closed-notification.service.js";
import { findTicketRecipientName } from "./ticket-recipient-name.service.js";

// ── Stubs ────────────────────────────────────────────────────────────────────

let sent: any[] = [];
(resend.emails as any).send = async (message: any) => {
  sent.push(message);
  return { data: { id: "stub" }, error: null };
};
const last = () => sent[sent.length - 1];

let userByEmail: Record<string, { fullname: string }> = {};
const lean = <T>(value: T) => {
  const query: any = Promise.resolve(value);
  query.lean = async () => value;
  return query;
};
(User as any).findOne = (filter: any) => {
  const re: RegExp | undefined = filter?.email;
  const key = Object.keys(userByEmail).find((e) => re?.test(e));
  return lean(key ? userByEmail[key] : null);
};
const staff = [
  { _id: "u1", fullname: "ada okafor", email: "ada@freightafford.com" },
  { _id: "u2", fullname: "bola ade", email: "bola@freightafford.com" },
];
(User as any).find = () => lean(staff);

const ticket = {
  _id: "64b000000000000000000001",
  ticket_id: "FA-2026-1043",
  customer_email: "Chinedu Eze <chinedu@agroexports.ng>",
  subject: "Delay on <b>booking</b>",
  status: "open",
  assigned_to: null,
};
(Ticket as any).findOne = () => ({ sort: async () => null });
(Ticket as any).findById = async () => ticket;
(Ticket as any).findByIdAndUpdate = async () => ticket;
(TicketMessage as any).create = async (doc: any) => doc;

beforeEach(() => {
  sent = [];
  userByEmail = {};
});

// ── Shared checks ────────────────────────────────────────────────────────────

const ADMINS = [
  "freightaffords@gmail.com",
  "devfranklinandrew@gmail.com",
  "alonsokelvin1@gmail.com",
  "chiamaka.k@ewebalinternational.ng",
];

const assertClean = (message: any) => {
  const { html, subject } = message;
  assert.ok(html?.startsWith("<!DOCTYPE html>"), "html uses the shared layout");
  assert.ok(html.includes("https://freightafford.com/email/logo.png"), "logo is a hosted PNG");
  for (const bad of ["undefined", "null", "NaN", "[object Object]", "{{", "Invalid Date"]) {
    assert.ok(!html.includes(bad), `html contains "${bad}"`);
    assert.ok(!String(subject).includes(bad), `subject contains "${bad}"`);
  }
  assert.ok(!/<script/i.test(html), "no raw script tag");
  assert.ok(!html.toLowerCase().includes("per container"), "prices are totals, not per container");
};

const fullRequest = {
  originPort: "apapa, nigeria",
  destinationPort: "rotterdam, netherlands",
  originPortCode: "NGAPP",
  destinationPortCode: "NLRTM",
  containerSize: "40ft HC",
  containerQuantity: 2,
  proposedPrice: 2450,
  adminCounterPrice: 2780,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("auth emails", () => {
  it("OTP shows each digit and the expiry", async () => {
    await sendOTPEmail("a@b.com", "chinedu eze", "482915", 10);
    assertClean(last());
    assert.equal(last().to, "a@b.com");
    assert.equal(last().subject, "482915 is your Freightafford code");
    assert.match(last().from, /^Freightafford </);
    for (const digit of "482915") assert.ok(last().html.includes(`>${digit}</div>`));
    assert.ok(last().html.includes("10 minutes"));
    assert.ok(last().html.includes("Verify your email, Chinedu"));
  });

  it("resend OTP and password reset render", async () => {
    await resendOTPEmail("a@b.com", "chinedu", "730164", 10);
    assertClean(last());
    const link = "https://freightafford.com/reset-password/abc123";
    await passwordResetEmail("a@b.com", "chinedu", link, 15);
    assertClean(last());
    assert.equal(last().html.split(link).length - 1, 3, "button href, fallback href and fallback text");
  });

  it("escapes a name with HTML in it", async () => {
    await sendOTPEmail("a@b.com", "<script>alert(1)</script>", "111111", 10);
    assertClean(last());
    assert.ok(last().html.includes("&lt;script&gt;"));
  });
});

describe("freight request emails", () => {
  it("admin alert keeps the same recipients and shows request details", async () => {
    await sendAdminFreightRequestNotification({
      originPort: "apapa, nigeria",
      destinationPort: "rotterdam, netherlands",
      commodity: "sesame seeds",
      proposedPrice: 2450,
      cargoWeight: 24000,
      quantity: 1,
      batchId: null,
      originPortCode: "NGAPP",
      destinationPortCode: "NLRTM",
      customerName: "Chinedu Eze",
      customerEmail: "chinedu@agroexports.ng",
      containerSize: "40ft HC",
      containerQuantity: 2,
      cargoReadyDate: "2026-10-28",
    });
    const m = last();
    assertClean(m);
    assert.deepEqual(m.to, ADMINS);
    assert.equal(m.subject, "New freight request: NGAPP → NLRTM");
    for (const text of ["Chinedu Eze", "Sesame Seeds", "24,000 kg", "USD 2,450.00", "2 &times; 40ft HC", "28 Oct 2026", "Apapa, Nigeria"])
      assert.ok(m.html.includes(text), `missing ${text}`);
  });

  it("admin alert still works with the old arguments (legacy request, batch)", async () => {
    await sendAdminFreightRequestNotification({
      originPort: "lagos",
      destinationPort: "hamburg",
      commodity: "cocoa",
      proposedPrice: 1000,
      cargoWeight: 500,
      quantity: 3,
      batchId: "batch_1",
    });
    assertClean(last());
    assert.equal(last().subject, "New batch: 3 freight requests, Lagos → Hamburg");
    assert.ok(last().html.includes("requests?batchId=batch_1"));
  });

  it("accepted email shows the agreed (counter) price", async () => {
    await sendCustomerAcceptedNotification("c@d.com", "chinedu", "FA-2026-482913", fullRequest);
    assertClean(last());
    assert.ok(last().html.includes("USD 2,780.00"));
    assert.ok(!last().html.includes("USD 2,450.00"));
    await sendCustomerAcceptedNotification("c@d.com", "chinedu", "FA-2026-482913", { ...fullRequest, adminCounterPrice: undefined });
    assert.ok(last().html.includes("USD 2,450.00"));
  });

  it("all customer request emails render with and without details", async () => {
    const calls = [
      () => sendCustomerAcceptedNotification("c@d.com", "chinedu", "FA-2026-1"),
      () => sendCustomerBatchAcceptedNotification("c@d.com", "chinedu", ["FA-2026-1", "FA-2026-2"]),
      () => sendCustomerBatchAcceptedNotification("c@d.com", "chinedu", ["FA-2026-1", "FA-2026-2"], fullRequest),
      () => sendCustomerCounterNotification("c@d.com", "chinedu", 2780, "Peak season"),
      () => sendCustomerCounterNotification("c@d.com", "chinedu", 2780, "Peak season", fullRequest),
      () => sendCustomerRejectedNotification("c@d.com", "chinedu", "No equipment"),
      () => sendCustomerRejectedNotification("c@d.com", "chinedu", "No equipment", fullRequest),
      () => sendAdminCustomerDecisionNotification(ADMINS, "chinedu eze", "accept", fullRequest),
      () => sendAdminCustomerDecisionNotification(ADMINS, "chinedu eze", "reject"),
    ];
    for (const call of calls) {
      await call();
      assertClean(last());
    }
    assert.equal(last().subject, "Chinedu Eze declined the counter offer");
  });

  it("escapes a counter reason", async () => {
    await sendCustomerCounterNotification("c@d.com", "chinedu", 1, `<img src=x onerror="alert(1)">`, fullRequest);
    assertClean(last());
    assert.ok(!last().html.includes("<img src=x"));
  });
});

describe("booking emails", () => {
  it("status update accepts every status format callers send", async () => {
    for (const status of ["in_transit", "in transit", "IN_TRANSIT"]) {
      await sendShipmentStatusUpdate("c@d.com", "chinedu", "FA-2026-1", status, { ...fullRequest, vessel: "MAERSK KENSINGTON", eta: new Date("2026-11-26") });
      assertClean(last());
      assert.ok(last().html.includes("Your shipment is in transit"));
      assert.equal(last().subject, "Booking FA-2026-1 is in transit");
    }
    for (const status of ["confirmed", "arrived", "delivered", "cancelled", "awaiting_confirmation", "something_new"]) {
      await sendShipmentStatusUpdate("c@d.com", "chinedu", "FA-2026-1", status);
      assertClean(last());
    }
  });

  it("schedule email works for the controller and the Maersk sync call shapes", async () => {
    await sendBookingScheduleNotification("c@d.com", "chinedu", "238410597", "Maersk", "MAERSK KENSINGTON", new Date("2026-11-04"));
    assertClean(last());
    assert.equal(last().subject, "Shipment scheduled: MAERSK KENSINGTON, 4 Nov 2026");
    await sendBookingScheduleNotification("c@d.com", "chinedu", "", "Maersk", "", undefined as any, undefined, { isUpdate: true, bookingNumber: "FA-2026-1" });
    assertClean(last());
    assert.equal(last().subject, "Shipping details updated");
  });

  it("BL, containers, reminder and monthly report render", async () => {
    await sendBillOfLadingNotification("c@d.com", "chinedu", "FA-2026-1", "finalized", "original_bill_of_lading");
    assertClean(last());
    assert.equal(last().subject, "Original Bill of Lading ready: FA-2026-1");
    await sendContainerNumbersNotification("c@d.com", "chinedu", "FA-2026-1", "apapa", "rotterdam", ["MSKU7734120", "MSKU7734138"]);
    assertClean(last());
    assert.ok(last().html.includes("MSKU7734138"));
    await sendSailingReminderNotification("c@d.com", "chinedu", "FA-2026-1", "", "", "", "", new Date("2026-11-04"));
    assertClean(last());
    assert.ok(last().html.includes("4 Nov 2026"), "sailing date shown even without ports");

    const file = Buffer.from("report");
    await sendMonthlyReportToAdmins(ADMINS, "September 2026", 42, "$118,400.00", "sailed.xlsx", file);
    assertClean(last());
    assert.deepEqual(last().to, ADMINS);
    assert.deepEqual(last().attachments, [{ filename: "sailed.xlsx", content: file.toString("base64") }]);
  });
});

describe("invoice emails", () => {
  it("render with and without details; rejection doesn't ask for a re-upload", async () => {
    await sendUploadInvoiceNotification("c@d.com", "chinedu", "INV-2026-00187", 5560, new Date("2026-10-30"), { bookingNumber: "FA-2026-1", description: "Ocean freight" });
    assertClean(last());
    assert.equal(last().subject, "Invoice INV-2026-00187: USD 5,560.00");
    await sendUploadInvoiceNotification("c@d.com", "chinedu", "INV-2026-00187", 5560, new Date("2026-10-30"));
    assertClean(last());
    await sendSubmitPaymentProofNotification(ADMINS, "INV-2026-00187", "REF-1", "awaiting_verification");
    assertClean(last());
    assert.deepEqual(last().to, ADMINS);
    await sendVerifyPaymentNotification("c@d.com", "chinedu", "approve", "INV-2026-00187", "paid", { amount: 5560, paidAt: new Date(), paymentReference: "REF-1" });
    assertClean(last());
    assert.equal(last().subject, "Payment confirmed: INV-2026-00187");
    await sendVerifyPaymentNotification("c@d.com", "chinedu", "reject", "INV-2026-00187", "rejected");
    assertClean(last());
    assert.equal(last().subject, "Payment not confirmed: INV-2026-00187");
    assert.ok(!/upload/i.test(last().html), "a rejected invoice can't take a new upload");
  });
});

describe("KYC emails", () => {
  it("render, escape and keep staff bcc'd", async () => {
    const to = { email: "c@d.com", fullname: "chinedu" };
    await sendKycReceivedEmail(to, "Agro & Sons <Ltd>");
    assertClean(last());
    assert.ok(last().html.includes("Agro &amp; Sons &lt;Ltd&gt;"));
    await sendKycApprovedEmail(to, "Agro");
    assertClean(last());
    await sendKycChangesEmail(to, "Agro", [{ label: "CAC certificate", note: "Blurry" }]);
    assertClean(last());
    await sendKycRejectedEmail(to, "Agro", "Doesn't match");
    assertClean(last());
    await sendKycNewSubmissionEmail({ id: "k1", businessName: "Agro", accountType: "exporter", applicantName: "Chinedu", applicantEmail: "c@d.com" });
    assertClean(last());
    assert.equal(last().to, "ada@freightafford.com");
    assert.deepEqual(last().bcc, ["bola@freightafford.com"]);
  });
});

describe("support and chat emails", () => {
  it("chat alert keeps recipients and no longer shouts the name", async () => {
    await sendChatInitiatedNotification({ customerName: "chinedu eze", customerEmail: "c@d.com", sessionType: "request_linked", originPort: "apapa", destinationPort: "rotterdam", commodity: "sesame" });
    assertClean(last());
    assert.deepEqual(last().to, ADMINS);
    assert.equal(last().subject, "New chat: Chinedu Eze is waiting");
    await sendChatInitiatedNotification({ customerName: "chinedu eze", customerEmail: "c@d.com", sessionType: "general" });
    assertClean(last());
  });

  it("ticket subjects keep an ID the inbound webhook can read back", async () => {
    await sendTicketAcknowledgement(ticket.customer_email, ticket.ticket_id, ticket.subject);
    assertClean(last());
    assert.equal(extractTicketId(last().subject), "FA-2026-1043");
    assert.ok(last().text.includes("FA-2026-1043"), "plain-text version kept");
    assert.ok(!last().html.includes("<b>booking</b>"), "inbound subject is escaped");

    await sendTicketClosedNotification(ticket.customer_email, ticket.ticket_id, ticket.subject);
    assertClean(last());
    assert.equal(extractTicketId(last().subject), "FA-2026-1043");

    await assignCso(ticket._id as any);
    assertClean(last());
    assert.equal(last().to, "ada@freightafford.com");
    assert.equal(extractTicketId(last().subject), "FA-2026-1043");
    assert.ok(last().html.includes(`/app/admin/tickets/${ticket._id}`));

    await replyToTicket(ticket._id, "u1" as any, "ada okafor", "Hi,\n<b>New ETD</b> is 11 Nov.");
    assertClean(last());
    assert.equal(last().subject, "Re: [FA-2026-1043] Delay on <b>booking</b>");
    assert.equal(last().to, ticket.customer_email);
    assert.ok(last().html.includes("&lt;b&gt;New ETD&lt;/b&gt;"), "reply text is escaped");
    assert.equal(last().text, "Hi,\n<b>New ETD</b> is 11 Nov.");
  });

  it("greets ticket customers by account name, then display name, else Hello", async () => {
    userByEmail = { "chinedu@agroexports.ng": { fullname: "chinedu eze" } };
    assert.equal(await findTicketRecipientName("CHINEDU@agroexports.ng"), "chinedu eze");
    await sendTicketAcknowledgement("chinedu@agroexports.ng", "FA-2026-1", "Hi");
    assert.ok(last().html.includes("Hi Chinedu,"));

    userByEmail = {};
    assert.equal(await findTicketRecipientName(`"Bola Ade" <bola@x.com>`), "Bola Ade");
    assert.equal(await findTicketRecipientName("someone@x.com"), null);
    assert.equal(await findTicketRecipientName("a+b@x.com"), null, "regex characters in the address are safe");
    await sendTicketClosedNotification("someone@x.com", "FA-2026-2", "Hi");
    assert.ok(last().html.includes("Hello,"));
  });
});
