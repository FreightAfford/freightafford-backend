export const normalizeInboundEmail = (data) => {
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
//# sourceMappingURL=normalize-inbound.js.map