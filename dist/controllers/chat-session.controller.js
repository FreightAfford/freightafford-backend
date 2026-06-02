import { ROOMS, SOCKET_EVENTS } from "../configurations/events.js";
import ChatSessionService from "../services/chat-session.service.js";
import { getIO } from "../socket.js";
const ChatSessionController = {
    // ── POST /api/chat/sessions ────────────────────────────────────────────────
    createSession: async (req, res, next) => {
        try {
            const customerId = req.user._id.toString();
            const { type, freightRequestId, bookingId } = req.body;
            if (!type || !["general", "request_linked"].includes(type)) {
                res.status(400).json({
                    success: false,
                    message: 'type must be "general" or "request_linked"',
                });
                return;
            }
            const { session, queuePosition } = await ChatSessionService.createSession({
                customerId,
                type,
                freightRequestId,
                bookingId,
            });
            res.status(201).json({
                success: true,
                message: "Chat session created successfully",
                data: { session, queuePosition },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── GET /api/chat/sessions ─────────────────────────────────────────────────
    getAllSessions: async (req, res, next) => {
        try {
            const { status, page = "1", limit = "20" } = req.query;
            const statusFilter = status
                ? status
                    .split(",")
                    .map((s) => s.trim())
                : undefined;
            const { sessions, total } = await ChatSessionService.getAllSessions({ status: statusFilter }, { page: parseInt(page), limit: parseInt(limit) });
            res.status(200).json({
                success: true,
                data: {
                    sessions,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(total / parseInt(limit)),
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── GET /api/chat/sessions/mine ────────────────────────────────────────────
    getMySessions: async (req, res, next) => {
        try {
            const customerId = req.user._id.toString();
            const { status } = req.query;
            const sessions = await ChatSessionService.getCustomerSessions(customerId, status);
            res.status(200).json({
                success: true,
                data: { sessions },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── GET /api/chat/sessions/:sessionId ─────────────────────────────────────
    getSessionById: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const requesterId = req.user._id.toString();
            const requesterRole = req.user.role === "admin" ? "cso" : "customer";
            const session = await ChatSessionService.getSessionById(sessionId, requesterId, requesterRole);
            res.status(200).json({
                success: true,
                data: { session },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── PATCH /api/chat/sessions/:sessionId/accept ─────────────────────────────
    // After accepting via REST, broadcasts chat:session_updated to the session
    // room so the customer's UI updates in real time without polling.
    // Also broadcasts updated queue positions to all remaining waiting customers.
    //
    acceptSession: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const csoId = req.user._id.toString();
            const { session, updatedQueue } = await ChatSessionService.acceptSession(sessionId, csoId);
            const io = getIO();
            // Notify everyone in the session room (customer sees "CSO joined")
            io.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                sessionId,
                status: "active",
                assignedCSO: {
                    _id: csoId,
                    fullname: req.user.fullname,
                },
            });
            // Notify CSO lobby so sidebar reorders
            io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                sessionId,
                status: "active",
            });
            // Broadcast updated queue positions to each affected customer
            for (const entry of updatedQueue) {
                io.to(ROOMS.user(entry.customerId)).emit(SOCKET_EVENTS.QUEUE_POSITION_UPDATE, { sessionId: entry.sessionId, queuePosition: entry.queuePosition });
            }
            res.status(200).json({
                success: true,
                message: "Session accepted",
                data: { session, updatedQueue },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── PATCH /api/chat/sessions/:sessionId/close ──────────────────────────────
    closeSession: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const closedById = req.user._id.toString();
            const closedByRole = req.user.role === "admin" ? "cso" : "customer";
            const { session, updatedQueue } = await ChatSessionService.closeSession(sessionId, closedById, closedByRole);
            const io = getIO();
            // Notify everyone in the session room
            io.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                sessionId,
                status: "closed",
                closedBy: closedById,
            });
            // Notify CSO lobby
            io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                sessionId,
                status: "closed",
            });
            // If it was a waiting session, broadcast updated queue positions
            if (updatedQueue) {
                for (const entry of updatedQueue) {
                    io.to(ROOMS.user(entry.customerId)).emit(SOCKET_EVENTS.QUEUE_POSITION_UPDATE, { sessionId: entry.sessionId, queuePosition: entry.queuePosition });
                }
            }
            res.status(200).json({
                success: true,
                message: "Session closed",
                data: { session, updatedQueue },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── PATCH /api/chat/sessions/:sessionId/reassign ───────────────────────────
    reassignSession: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const fromCSOId = req.user._id.toString();
            const { toCSOId } = req.body;
            if (!toCSOId) {
                res
                    .status(400)
                    .json({ success: false, message: "toCSOId is required" });
                return;
            }
            if (fromCSOId === toCSOId) {
                res.status(400).json({
                    success: false,
                    message: "Cannot reassign a session to yourself",
                });
                return;
            }
            const { session, updatedQueue } = await ChatSessionService.reassignSession(sessionId, fromCSOId, toCSOId);
            const io = getIO();
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
                message: `A chat session has been reassigned to you by ${req.user.fullname}`,
            });
            // Notify lobby
            io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_SESSION_UPDATED, {
                sessionId,
                status: "waiting",
                reassignedTo: toCSOId,
            });
            // Broadcast updated queue positions
            for (const entry of updatedQueue) {
                io.to(ROOMS.user(entry.customerId)).emit(SOCKET_EVENTS.QUEUE_POSITION_UPDATE, { sessionId: entry.sessionId, queuePosition: entry.queuePosition });
            }
            res.status(200).json({
                success: true,
                message: "Session reassigned",
                data: { session, updatedQueue },
            });
        }
        catch (error) {
            next(error);
        }
    },
    // ── GET /api/chat/sessions/csos ────────────────────────────────────────────
    getAvailableCSOs: async (req, res, next) => {
        try {
            const excludeCSOId = req.user._id.toString();
            const csos = await ChatSessionService.getAvailableCSOs(excludeCSOId);
            res.status(200).json({
                success: true,
                data: { csos },
            });
        }
        catch (error) {
            next(error);
        }
    },
};
export default ChatSessionController;
//# sourceMappingURL=chat-session.controller.js.map