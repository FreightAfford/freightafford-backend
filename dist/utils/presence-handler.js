import { ROOMS, SOCKET_EVENTS } from "../configurations/events.js";
// ─── Presence Handler ─────────────────────────────────────────────────────────
//
// Tracks which CSOs are currently online using an in-memory Map.
// Fast O(1) reads, no DB round trips for presence checks.
//
// Structure: userId → socket.id
// If the socket.id matches on disconnect, we know it's their last tab.
// ─────────────────────────────────────────────────────────────────────────────
const onlineCSOs = new Map(); // userId → socket.id
export const registerPresenceHandlers = (io, socket) => {
    const user = socket.data.user;
    const userId = user._id.toString();
    const isCSO = user.role === "admin";
    // Every connected user joins their own private room immediately.
    socket.join(ROOMS.user(userId));
    if (isCSO) {
        socket.join(ROOMS.CSO_LOBBY);
        onlineCSOs.set(userId, socket.id);
        // Notify other CSOs this one is online
        socket.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
            userId,
            fullname: user.fullname,
            status: "online",
        });
        //   Send current online snapshot to the newly connected CSO
        const currentOnlineCSOs = Array.from(onlineCSOs.keys()).map((id) => ({
            userId: id,
            status: "online",
        }));
        socket.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
            type: "initial_snapshot",
            onlineCSOs: currentOnlineCSOs,
        });
    }
    // Manual offline signal (logout, idle)
    socket.on(SOCKET_EVENTS.PRESENCE_OFFLINE, () => {
        if (!isCSO)
            return;
        onlineCSOs.delete(userId);
        socket.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
            userId,
            fullname: user.fullname,
            status: "offline",
        });
    });
    // Implicit disconnect (tab close, network drop)
    socket.on("disconnect", () => {
        if (!isCSO)
            return;
        // Guard: only remove if this is their last active socket (last tab)
        if (onlineCSOs.get(userId) === socket.id) {
            onlineCSOs.delete(userId);
            socket.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
                userId,
                fullname: user.fullname,
                status: "offline",
            });
        }
    });
};
export const isCSOOnline = (userId) => onlineCSOs.has(userId);
export const getOnlineCSOs = () => Array.from(onlineCSOs.keys());
//# sourceMappingURL=presence-handler.js.map