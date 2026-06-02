// ─── Socket Event Constants ───────────────────────────────────────────────────
//
// Single source of truth for all socket event names.
// Import this on both the server and (if using a shared types package)
// the frontend to guarantee event name consistency.
//
// Naming convention: <namespace>:<action>
// ─────────────────────────────────────────────────────────────────────────────
export const SOCKET_EVENTS = {
    // ── Connection lifecycle (built-in, documented for reference) ─────────────
    CONNECT: "connect",
    DISCONNECT: "disconnect",
    CONNECT_ERROR: "connect_error",
    // ── Chat: session room management ─────────────────────────────────────────
    CHAT_JOIN: "chat:join", // client joins a session room
    CHAT_LEAVE: "chat:leave", // client leaves a session room
    // ── Chat: messaging ───────────────────────────────────────────────────────
    CHAT_MESSAGE: "chat:message", // send / receive a message
    CHAT_TYPING: "chat:typing", // user started typing
    CHAT_STOP_TYPING: "chat:stop_typing", // user stopped typing
    CHAT_READ: "chat:read", // client marks messages as read
    CHAT_READ_RECEIPT: "chat:read_receipt", // server confirms read to sender
    // ── Chat: session state changes ───────────────────────────────────────────
    CHAT_SESSION_UPDATED: "chat:session_updated", // status changed (accepted/closed/reassigned)
    CHAT_NEW_SESSION: "chat:new_session", // new waiting session (to cso:lobby)
    // ── Queue ─────────────────────────────────────────────────────────────────
    QUEUE_POSITION_UPDATE: "queue:position_update", // customer's position changed
    // ── Presence ──────────────────────────────────────────────────────────────
    PRESENCE_ONLINE: "presence:online", // CSO comes online
    PRESENCE_OFFLINE: "presence:offline", // CSO goes offline
    PRESENCE_UPDATE: "presence:update", // broadcast CSO presence to cso:lobby
    // ── Errors ────────────────────────────────────────────────────────────────
    ERROR: "error",
};
// ── Room name helpers ─────────────────────────────────────────────────────────
// Centralised so room names never drift between handlers
export const ROOMS = {
    session: (sessionId) => `session:${sessionId}`,
    user: (userId) => `user:${userId}`,
    CSO_LOBBY: "cso:lobby",
};
//# sourceMappingURL=events.js.map