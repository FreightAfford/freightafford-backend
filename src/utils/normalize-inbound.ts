type ResendInboundPayload = {
  attachments?: any[];
  bcc?: string[];
  cc?: string[];
  created_at?: string;
  email_id?: string;
  from?: string;
  message_id?: string;
  subject?: string;
  to?: string[];
};

export const normalizeInboundEmail = (data: any) => {
  return {
    providerEmailId: data.id,
    messageId: data.message_id,

    from: data.from,
    to: data.to || [],
    cc: data.cc || [],
    bcc: data.bcc || [],

    subject: data.subject || "No Subject",

    bodyText: data.text || "",
    bodyHtml: data.html || "",

    body: data.text?.trim() || data.html?.trim() || "",

    headers: data.headers || {},

    rawDownloadUrl: data.raw?.download_url || null,

    rawExpiresAt: data.raw?.expires_at || null,

    attachments: data.attachments || [],

    receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
  };
};
