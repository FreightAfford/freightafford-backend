import User from "../models/user.model.js";
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Best-effort name for a support ticket's customer, used only to greet them.
 * `customer_email` holds the raw inbound `from`, which may be
 * "Chinedu Eze <chinedu@example.com>" or just the address. Prefers the
 * account's name, then the display name, else null. Never throws.
 */
export const findTicketRecipientName = async (customerEmail) => {
    const raw = String(customerEmail ?? "").trim();
    const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const displayName = match?.[1]?.trim() || null;
    const address = (match?.[2] ?? raw).trim();
    try {
        if (address) {
            const user = await User.findOne({ email: new RegExp(`^${escapeRegex(address)}$`, "i") }, { fullname: 1 }).lean();
            if (user?.fullname)
                return user.fullname;
        }
    }
    catch (err) {
        console.error("[ticket-email] Name lookup failed:", err);
    }
    return displayName && !displayName.includes("@") ? displayName : null;
};
//# sourceMappingURL=ticket-recipient-name.service.js.map