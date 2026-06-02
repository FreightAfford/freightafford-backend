import { ROOMS, SOCKET_EVENTS } from "../configurations/events.js";
import MessageService from "../services/chat-message.service.js";
import ChatSessionService from "../services/chat-session.service.js";
import QueueService from "../services/queue.service.js";
// ─── Session Handler ──────────────────────────────────────────────────────────
//
// Handles all session-level socket events:
//   - Joining / leaving session rooms
//   - Accepting, closing, reassigning sessions via socket
//     (mirrors the REST endpoints for clients that prefer socket-only flow)
//   - Broadcasting session state changes to all participants
//   - Queue position updates after every state transition
// ─────────────────────────────────────────────────────────────────────────────
export const registerSessionHandlers = (io, socket) => {
    const user = socket.data.user;
    const userId = user._id.toString();
    const isCSO = user.role === "admin";
    // ── chat:join ─────────────────────────────────────────────────────────────
    //
    // Client emits this after connecting to subscribe to a session room.
    // On join we:
    //   1. Validate the user is a participant of the session
    //   2. Join the socket.io room
    //   3. Mark undelivered messages as delivered (they're now online)
    //   4. Send current queue position to customer (if session is waiting)
    //
    socket.on(SOCKET_EVENTS.CHAT_JOIN, async ({ sessionId }) => {
        try {
            const requesterRole = isCSO ? "cso" : "customer";
            const session = await ChatSessionService.getSessionById(sessionId, userId, requesterRole);
            socket.join(ROOMS.session(sessionId));
            // Mark all messages in this session as delivered for this user
            const deliveredCount = await MessageService.markAsDelivered(sessionId, userId);
            // Notify the other participant their messages were delivered
            if (deliveredCount > 0) {
                socket
                    .to(ROOMS.session(sessionId))
                    .emit(SOCKET_EVENTS.CHAT_READ_RECEIPT, {
                    sessionId,
                    status: "delivered",
                    byUserId: userId,
                });
            }
            // Send queue position to customer if still waiting
            if (!isCSO && session.status === "waiting") {
                const position = await QueueService.getPositionForSession(sessionId);
                if (position !== null) {
                    socket.emit(SOCKET_EVENTS.QUEUE_POSITION_UPDATE, {
                        sessionId,
                        queuePosition: position,
                    });
                }
            }
        }
        catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, {
                event: SOCKET_EVENTS.CHAT_JOIN,
                message: error.message ?? "Failed to join session",
            });
        }
    });
    // ── chat:leave ────────────────────────────────────────────────────────────
    //
    // Client emits this when navigating away from a chat.
    // Does NOT close the session — just unsubscribes the socket from the room.
    //
    socket.on(SOCKET_EVENTS.CHAT_LEAVE, ({ sessionId }) => {
        socket.leave(ROOMS.session(sessionId));
    });
    // ── chat:session:accept (CSO only) ────────────────────────────────────────
    //
    // CSO accepts a waiting session via socket (alternative to REST endpoint).
    // After accepting:
    //   1. Emit session_updated to the session room (notifies the customer)
    //   2. Broadcast updated queue positions to all affected customers
    //   3. Notify the cso:lobby that this session is now active
    //
    socket.on(SOCKET_EVENTS.CHAT_SESSION_UPDATED, async ({ sessionId, action, toCSOId, }) => {
        try {
            if (!isCSO && action !== "close") {
                socket.emit(SOCKET_EVENTS.ERROR, {
                    event: SOCKET_EVENTS.CHAT_SESSION_UPDATED,
                    message: "Unauthorized",
                });
                return;
            }
            let session;
            let updatedQueue = null;
            if (action === "accept") {
                // ── Accept ─────────────────────────────────────────────────────────
                const result = await ChatSessionService.acceptSession(sessionId, userId);
                session = result.session;
                updatedQueue = result.updatedQueue;
                // Notify everyone in the session room (customer sees "CSO joined")
                io.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "active",
                    assignedCSO: {
                        _id: userId,
                        fullname: user.fullname,
                    },
                });
                // Tell cso:lobby this session moved from waiting → active
                io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "active",
                });
            }
            else if (action === "close") {
                // ── Close ──────────────────────────────────────────────────────────
                const closedByRole = isCSO ? "cso" : "customer";
                const result = await ChatSessionService.closeSession(sessionId, userId, closedByRole);
                session = result.session;
                updatedQueue = result.updatedQueue;
                io.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "closed",
                    closedBy: userId,
                });
                io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "closed",
                });
            }
            else if (action === "reassign") {
                // ── Reassign ───────────────────────────────────────────────────────
                if (!toCSOId) {
                    socket.emit(SOCKET_EVENTS.ERROR, {
                        event: SOCKET_EVENTS.CHAT_SESSION_UPDATED,
                        message: "toCSOId is required for reassign",
                    });
                    return;
                }
                const result = await ChatSessionService.reassignSession(sessionId, userId, toCSOId);
                session = result.session;
                updatedQueue = result.updatedQueue;
                // Notify everyone in the session room
                io.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "waiting",
                    reassignedTo: toCSOId,
                });
                // Direct notification to the target CSO's private room
                io.to(ROOMS.user(toCSOId)).emit(SOCKET_EVENTS.CHAT_NEW_SESSION, {
                    sessionId,
                    type: "reassigned",
                    message: `A chat session has been reassigned to you by ${user.fullname}`,
                });
                // Notify lobby
                io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                    sessionId,
                    status: "waiting",
                    reassignedTo: toCSOId,
                });
            }
            // ── Broadcast updated queue positions to each affected customer ───────
            if (updatedQueue && updatedQueue.length > 0) {
                for (const entry of updatedQueue) {
                    io.to(ROOMS.user(entry.customerId)).emit(SOCKET_EVENTS.QUEUE_POSITION_UPDATE, {
                        sessionId: entry.sessionId,
                        queuePosition: entry.queuePosition,
                    });
                }
            }
        }
        catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, {
                event: SOCKET_EVENTS.CHAT_SESSION_UPDATED,
                message: error.message ?? "Session action failed",
            });
        }
    });
};
//# sourceMappingURL=session-handler.js.map