import { Types } from "mongoose";
import ChatMessage from "../models/chat-message.model.js";
import ChatSession from "../models/chat-session.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import QueueService from "./queue.service.js";
const writeSystemMessage = async (sessionId, senderId, content) => {
    await ChatMessage.create({
        session: sessionId,
        sender: senderId,
        senderRole: "cso",
        content,
        type: "system",
        status: "delivered",
    });
};
const ChatSessionService = {
    createSession: async (payload) => {
        const { customerId, type, freightRequestId, bookingId } = payload;
        if (type === "request_linked") {
            if (!freightRequestId) {
                throw new Error("freightRequestId is required for request_linked sessions");
            }
            const freightRequest = await FreightRequest.findOne({
                _id: freightRequestId,
                customer: customerId,
            });
            if (!freightRequest)
                throw new Error(`Freight request not found or does not belong to this customer`);
        }
        if (type === "request_linked" && freightRequestId) {
            const existingSession = await ChatSession.findOne({
                customer: customerId,
                freightRequest: freightRequestId,
                status: { $in: ["waiting", "active"] },
            });
            if (existingSession)
                throw new Error("An active or waiting chat session already exists for this request");
        }
        const session = await ChatSession.create({
            type,
            customer: customerId,
            freightRequest: freightRequestId ?? null,
            booking: bookingId ?? null,
            status: "waiting",
        });
        const queuePosition = await QueueService.assignPosition(session._id.toString());
        return { session, queuePosition };
    },
    acceptSession: async (sessionId, csoId) => {
        const session = await ChatSession.findById(sessionId);
        if (!session)
            throw new Error("Session not found");
        if (session.status !== "waiting")
            throw new Error(`Cannot accept a session with status: ${session.status}`);
        session.status = "active";
        session.assignedCSO = new Types.ObjectId(csoId);
        session.queuePosition = 0;
        session.metadata.acceptedAt = new Date();
        await session.save();
        const cso = await User.findById(csoId, "fullname");
        await writeSystemMessage(session._id, csoId, `${cso?.fullname ?? "Support"} has joined the chat.`);
        const updatedQueue = await QueueService.recalculateQueue();
        return { session, updatedQueue };
    },
    closeSession: async (sessionId, closedById, closedByRole) => {
        const session = await ChatSession.findById(sessionId);
        if (!session)
            throw new Error("Session not found");
        if (session.status === "closed")
            throw new Error("Session is already closed");
        const wasWaiting = session.status === "waiting";
        session.status = "closed";
        session.metadata.closedAt = new Date();
        session.metadata.closedBy = new Types.ObjectId(closedById);
        session.queuePosition = 0;
        await session.save();
        const closer = await User.findById(closedById, "fullname");
        const closerLabel = closedByRole === "cso"
            ? `${closer?.fullname ?? "Support"}`
            : "the customer";
        await writeSystemMessage(session._id, closedById, `Chat was closed by ${closerLabel}`);
        const updatedQueue = wasWaiting
            ? await QueueService.recalculateQueue()
            : null;
        return { session, updatedQueue };
    },
    reassignSession: async (sessionId, fromCSOId, toCSOId) => {
        const session = await ChatSession.findById(sessionId);
        if (!session)
            throw new Error("Session not found");
        if (session.status !== "active")
            throw new Error("Only active sessions can be reassigned");
        const targetCSO = await User.findOne({
            _id: toCSOId,
            role: "admin",
            status: "active",
        });
        if (!targetCSO)
            throw new Error("Target CSO not found or is not active");
        session.metadata.previousCSOId = new Types.ObjectId(fromCSOId);
        session.metadata.reassignedAt = new Date();
        session.status = "waiting";
        session.assignedCSO = new Types.ObjectId(toCSOId);
        await session.save();
        await QueueService.assignPosition(session._id.toString());
        const fromCSO = await User.findById(fromCSOId, "fullname");
        await writeSystemMessage(session._id, fromCSOId, `Chat was reassigned to ${targetCSO.fullname} by ${fromCSO?.fullname ?? "Support"}`);
        const updatedQueue = await QueueService.recalculateQueue();
        return { session, updatedQueue };
    },
    getAllSessions: async (filters, pagination) => {
        const { status, csoId } = filters;
        const { page, limit } = pagination;
        const query = {};
        if (status)
            query.status = Array.isArray(status) ? { $in: status } : status;
        if (csoId)
            query.assignedCSO = csoId;
        const [sessions, total] = await Promise.all([
            ChatSession.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("customer", "fullname email companyName")
                .populate("freightRequest", "originPort destinationPort status containerSize")
                .populate("booking", "bookingNumber vessel status"),
            ChatSession.countDocuments(query),
        ]);
        return { sessions, total };
    },
    getSessionById: async (sessionId, requesterId, requesterRole) => {
        const session = await ChatSession.findById(sessionId)
            .populate("customer", "fullname email phoneNumber companyName status")
            .populate("freightRequest", "originPort destinationPort status containerSize containerQuantity proposedPrice adminCounterPrice")
            .populate("booking", "bookingNumber vessel sailingDate status shippingLine")
            .populate("assignedCSO", "fullname email");
        if (!session)
            throw new Error("Session not found");
        // Customers can only view their own sessions
        if (requesterRole === "customer" &&
            session.customer._id.toString() !== requesterId) {
            throw new Error("Unauthorized");
        }
        return session;
    },
    getCustomerSessions: async (customerId, status) => {
        const query = { customer: customerId };
        if (status)
            query.status = status;
        return ChatSession.find(query)
            .sort({ createdAt: -1 })
            .populate("freightRequest", "originPort destinationPort status")
            .populate("booking", "bookingNumber status")
            .populate("assignedCSO", "fullname email");
    },
    getAvailableCSOs: async (excludeCSOId) => {
        return User.find({
            role: "admin",
            status: "active",
            _id: { $ne: excludeCSOId },
        }, "fullname email");
    },
};
export default ChatSessionService;
//# sourceMappingURL=chat-session.service.js.map