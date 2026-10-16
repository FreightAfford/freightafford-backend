// Shared layout and building blocks for every Freightafford email.
// Email-safe markup: tables and inline styles in a 600px card, so it holds up
// in Gmail, Outlook and Apple Mail.
//
// Anything a user typed (names, reasons, subjects, messages) must go through
// escapeHtml before it reaches a block. Helpers that take plain text escape it
// themselves; helpers that take `html` expect it already escaped.

import envConfig from "../../configurations/env.configuration.js";

export const SUPPORT_EMAIL = "exports.ng@info.freightafford.com";
export const FROM = () => `Freightafford <${envConfig.RESEND_EMAIL}>`;
export const SUPPORT_FROM = `Freightafford Support <${SUPPORT_EMAIL}>`;
export const APP_URL = "https://freightafford.com";
// PNGs served by the frontend (frontend/public/email). Mail apps don't show SVG.
const ASSET_URL = `${APP_URL}/email`;

const C = {
  navy: "#0a2342",
  ink: "#0f172b",
  body: "#3d4b5f",
  muted: "#6b7a90",
  line: "#e1e7ef",
  mist: "#eef3f8",
  brand: "#1e90ff",
  brandDeep: "#1670d4",
  blueBg: "#e8f3ff",
  blueInk: "#0f5bb0",
};
const SANS = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',SFMono-Regular,Consolas,'Courier New',monospace";

export type Tone = "blue" | "green" | "ochre" | "red" | "grey";
const TONES: Record<Tone, { bg: string; ink: string; dot: string }> = {
  blue: { bg: C.blueBg, ink: C.blueInk, dot: C.brand },
  green: { bg: "#e6f7ee", ink: "#0b7a47", dot: "#12b76a" },
  ochre: { bg: "#fdf3df", ink: "#8a5a00", dot: "#e3a72f" },
  red: { bg: "#fdecec", ink: "#a12b2b", dot: "#d64545" },
  grey: { bg: "#eef1f5", ink: "#4a5668", dot: "#8a97a8" },
};

// ── Formatting ───────────────────────────────────────────────────────────────

export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "chinedu eze" -> "Chinedu" as plain text, for headings. Empty when there's no name. */
export const firstNameText = (fullname?: string | null) =>
  (String(fullname ?? "").trim().split(/\s+/)[0] ?? "").replace(/^./, (c) =>
    c.toUpperCase(),
  );

/** First name, escaped for body html. */
export const firstName = (fullname?: string | null) =>
  escapeHtml(firstNameText(fullname));

/** "Hi Chinedu," or "Hello," when the name is unknown. */
export const greeting = (fullname?: string | null) => {
  const name = firstName(fullname);
  return name ? `Hi ${name},` : "Hello,";
};

/** Port and commodity names are stored lower case: "apapa, nigeria" -> "Apapa, Nigeria". */
export const titleCase = (value?: string | null) =>
  String(value ?? "").replace(/(^|[\s,(/-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

export const formatDate = (value?: Date | string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const formatMoney = (amount?: number | null) =>
  typeof amount === "number" && Number.isFinite(amount)
    ? `USD ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";

export const mono = (text: string) =>
  `<span style="font-family:${MONO};">${escapeHtml(text)}</span>`;

// ── Blocks ───────────────────────────────────────────────────────────────────

export const paragraph = (html: string, extra = "") =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.body};${extra}">${html}</p>`;

/** Small grey line, e.g. "If you didn't request this…". */
export const smallPrint = (html: string) =>
  paragraph(html, `font-size:13px;line-height:20px;color:${C.muted};margin:0;`);

export const gap = (height = 20) =>
  `<div style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</div>`;

export const button = (text: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
    <td style="border-radius:10px;background:${C.brandDeep};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(text)}</a>
    </td></tr></table>`;

export const linkFallback = (url: string) =>
  `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">Or paste this link into your browser:<br>
   <a href="${escapeHtml(url)}" style="font-family:${MONO};font-size:12px;color:${C.blueInk};word-break:break-all;">${escapeHtml(url)}</a></p>`;

export type DetailRow = [label: string, html: string, options?: { mono?: boolean; big?: boolean }];

/** Label / value rows. Rows with an empty value are dropped. */
export const details = (rows: (DetailRow | false | null | undefined)[]) => {
  const kept = rows.filter((r): r is DetailRow => !!r && r[1] !== "");
  if (!kept.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;margin-top:6px;">
  ${kept
    .map(([label, value, opt = {}], i) => {
      const border = i < kept.length - 1 ? `border-bottom:1px solid ${C.line};` : "";
      return `<tr>
    <td style="padding:11px 16px;${border}font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};width:40%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:11px 16px;${border}font-family:${opt.mono ? MONO : SANS};font-size:${opt.big ? 17 : opt.mono ? 14 : 15}px;line-height:21px;font-weight:600;color:${C.ink};text-align:right;word-break:break-word;">${value}</td>
  </tr>`;
    })
    .join("")}</table>`;
};

export type RouteInfo = {
  originPort?: string | null;
  destinationPort?: string | null;
  originPortCode?: string | null;
  destinationPortCode?: string | null;
};

/**
 * Route card: port codes either side of a dashed sailing line, with optional
 * facts underneath. Falls back to port names when a request has no codes, and
 * renders nothing when the ports are unknown.
 */
export const route = (info: RouteInfo, facts: [string, string][] = []) => {
  const from = titleCase(info.originPort);
  const to = titleCase(info.destinationPort);
  if (!from || !to) return "";

  const port = (code: string | null | undefined, name: string, align: string) => {
    const top = code
      ? `<div style="font-family:${MONO};font-size:22px;line-height:28px;font-weight:600;letter-spacing:0.04em;color:${C.ink};">${escapeHtml(code)}</div>
      <div style="font-family:${SANS};font-size:13px;line-height:19px;color:${C.body};">${escapeHtml(name)}</div>`
      : `<div style="font-family:${SANS};font-size:16px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(name)}</div>`;
    return `<td width="38%" style="vertical-align:top;text-align:${align};">${top}</td>`;
  };

  const shownFacts = facts.filter(([, value]) => value !== "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;margin-top:6px;">
    <tr><td style="padding:18px 18px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${port(info.originPortCode, from, "left")}
        <td width="24%" style="vertical-align:middle;text-align:center;padding:0 6px;">
          <img src="${ASSET_URL}/ship.png" width="28" height="28" alt="" style="display:block;margin:0 auto 4px;border:0;">
          <div style="border-top:2px dashed ${C.brand};height:0;line-height:0;font-size:0;">&nbsp;</div>
        </td>
        ${port(info.destinationPortCode, to, "right")}
      </tr></table>
    </td></tr>
    ${
      shownFacts.length
        ? `<tr><td style="border-top:1px dashed #cbd6e3;padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${shownFacts
        .map(
          ([label, value]) => `<td class="stack" style="padding:12px 18px;vertical-align:top;">
        <div style="font-family:${SANS};font-size:12px;color:${C.muted};">${escapeHtml(label)}</div>
        <div style="font-family:${SANS};font-size:14px;line-height:20px;font-weight:700;color:${C.ink};padding-top:2px;">${value}</div></td>`,
        )
        .join("")}</tr></table></td></tr>`
        : ""
    }
  </table>`;
};

/** Tinted box, e.g. "Reason: …". Takes escaped html. */
export const note = (tone: Tone, html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr><td style="background:${TONES[tone].bg};border-radius:10px;padding:13px 16px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.ink};">${html}</td></tr></table>`;

export const reason = (tone: Tone, text: string) =>
  note(tone, `<strong>Reason:</strong> ${escapeHtml(text)}`);

export const otpCode = (code: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:10px auto 18px;"><tr>${String(code)
    .split("")
    .map(
      (digit) =>
        `<td style="padding:0 4px;"><div class="otp-d" style="width:44px;height:54px;line-height:54px;text-align:center;border:1px solid ${C.line};border-bottom:3px solid ${C.brand};border-radius:10px;background:#f7f9fc;font-family:${MONO};font-size:26px;font-weight:600;color:${C.ink};">${escapeHtml(digit)}</div></td>`,
    )
    .join("")}</tr></table>`;

/** "You proposed" (struck through) next to "Our offer". */
export const priceComparison = (proposed: number, offer: number) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;margin-top:6px;"><tr>
    <td class="stack" width="50%" style="padding:16px 18px;vertical-align:top;">
      <div style="font-family:${SANS};font-size:12px;color:${C.muted};">You proposed</div>
      <div style="font-family:${MONO};font-size:20px;line-height:28px;color:${C.muted};text-decoration:line-through;padding-top:2px;">${formatMoney(proposed)}</div></td>
    <td class="stack" width="50%" style="padding:16px 18px;vertical-align:top;background:${C.blueBg};border-radius:0 12px 12px 0;">
      <div style="font-family:${SANS};font-size:12px;color:${C.blueInk};font-weight:700;">Our offer</div>
      <div style="font-family:${MONO};font-size:22px;line-height:28px;font-weight:600;color:${C.ink};padding-top:2px;">${formatMoney(offer)}</div></td>
  </tr></table>`;

export const tags = (items: string[]) =>
  `<div style="margin-top:6px;">${items
    .map(
      (item) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:7px 11px;border-radius:8px;background:${C.navy};font-family:${MONO};font-size:14px;font-weight:600;letter-spacing:0.05em;color:#ffffff;">${escapeHtml(item)}</span>`,
    )
    .join("")}</div>`;

/** A message from a named person, e.g. a support reply. Escapes both values. */
export const message = (author: string, text: string) => {
  const initials =
    String(author ?? "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FA";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
    <td width="46" style="vertical-align:top;"><div style="width:36px;height:36px;line-height:36px;border-radius:36px;background:${C.navy};color:#ffffff;text-align:center;font-family:${SANS};font-size:13px;font-weight:700;">${escapeHtml(initials)}</div></td>
    <td style="vertical-align:top;">
      <div style="font-family:${SANS};font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(titleCase(author))}</div>
      <div style="margin-top:6px;background:#f3f6fa;border-radius:4px 12px 12px 12px;padding:13px 15px;font-family:${SANS};font-size:15px;line-height:23px;color:${C.ink};white-space:pre-wrap;">${escapeHtml(text)}</div>
    </td></tr></table>`;
};

const chip = (label: string, tone: Tone) => {
  const t = TONES[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${t.bg};border-radius:999px;padding:5px 11px 5px 9px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.ink};">
    <span style="display:inline-block;width:7px;height:7px;border-radius:7px;background:${t.dot};margin-right:6px;vertical-align:1px;"></span>${escapeHtml(label)}</td></tr></table>`;
};

// ── Layout ───────────────────────────────────────────────────────────────────

export type EmailLayout = {
  /** Shown in the inbox list after the subject. Plain text. */
  preheader?: string;
  /** Reference shown in the header, e.g. ["Booking", "FA-2026-482913"]. */
  reference?: [label: string, value: string];
  status: [label: string, tone: Tone];
  /** Plain text; escaped here. */
  heading: string;
  /** Escaped html built from the blocks above. */
  body: string;
};

export const emailLayout = ({ preheader, reference, status, heading, body }: EmailLayout) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;background:${C.mist};-webkit-text-size-adjust:100%;}
  @media (max-width:620px){
    .card{border-radius:0!important;}
    .px{padding-left:22px!important;padding-right:22px!important;}
    .stack{display:block!important;width:100%!important;box-sizing:border-box;border-radius:0!important;}
    .otp-d{width:38px!important;height:48px!important;line-height:48px!important;font-size:22px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.mist};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.mist};">
<tr><td align="center" style="padding:28px 12px 36px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td class="card" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(10,35,66,0.07);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="px" style="background:${C.navy};padding:22px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;"><a href="${APP_URL}" style="text-decoration:none;"><img src="${ASSET_URL}/logo.png" width="150" height="27" alt="Freightafford" style="display:block;border:0;width:150px;height:auto;color:#ffffff;font-family:${SANS};font-size:18px;font-weight:700;"></a></td>
            ${
              reference && reference[1]
                ? `<td align="right" style="vertical-align:middle;font-family:${SANS};font-size:11px;line-height:15px;color:#8fa9cc;">${escapeHtml(reference[0])}<br><span style="font-family:${MONO};font-size:13px;font-weight:600;color:#ffffff;">${escapeHtml(reference[1])}</span></td>`
                : ""
            }
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:28px 36px 32px;">
          ${chip(status[0], status[1])}
          <h1 style="margin:14px 0 10px;font-family:${SANS};font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.01em;color:${C.ink};">${escapeHtml(heading)}</h1>
          ${body}
        </td></tr>
        <tr><td class="px" style="padding:16px 36px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">
          Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.blueInk};font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:18px 24px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};">&copy; ${new Date().getFullYear()} Freightafford. All rights reserved.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
