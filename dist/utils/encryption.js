import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import envConfig from "../configurations/env.configuration.js";
import AppError from "../errors/app.error.js";
// Field-level encryption for sensitive identifiers (e.g. directors' NIN and
// passport numbers) so they're never stored in plain text.
// AES-256-GCM; stored as "v1:<iv>:<auth tag>:<ciphertext>", all base64.
const VERSION = "v1";
const getKey = () => {
    const raw = envConfig.KYC_ENCRYPTION_KEY;
    // 32 bytes, given as 64 hex characters or 44 base64 characters.
    const key = raw
        ? /^[0-9a-f]{64}$/i.test(raw)
            ? Buffer.from(raw, "hex")
            : Buffer.from(raw, "base64")
        : null;
    if (!key || key.length !== 32) {
        console.error("[encryption] KYC_ENCRYPTION_KEY is missing or not 32 bytes (64 hex characters).");
        throw new AppError("Verification is unavailable right now. Try again later.", 500);
    }
    return key;
};
export const encrypt = (plain) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
    ]);
    return [
        VERSION,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        ciphertext.toString("base64"),
    ].join(":");
};
export const decrypt = (stored) => {
    const [version, iv, tag, ciphertext] = stored.split(":");
    if (version !== VERSION || !iv || !tag || !ciphertext)
        throw new Error("Unrecognised encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
    ]).toString("utf8");
};
/** "A123*****" style masking for anywhere the full value isn't needed. */
export const mask = (value, visible = 3) => value.length <= visible
    ? "*".repeat(value.length)
    : value.slice(0, visible) + "*".repeat(value.length - visible);
//# sourceMappingURL=encryption.js.map