import AppError from "../errors/app.error.js";
import ChatMessage from "../models/chat-message.model.js";
import ChatSession from "../models/chat-session.model.js";
export const createSession = async ({ customerId, relatedRequest, relatedBooking, }) => {
    // Prevent multiple active/waiting sessions
    const existingSession = await ChatSession.findOne({
        customer: customerId,
        status: { $in: ["waiting", "active"] },
    });
    if (existingSession)
        return existingSession;
    const session = await ChatSession.create({
        customer: customerId,
        relatedRequest,
        relatedBooking,
    });
    return session;
};
export const getUserSessions = async (user) => {
    const isSupport = user.role === "cso" || user.role === "admin";
    const query = isSupport ? {} : { customer: user._id };
    return ChatSession.find(query)
        .populate("customer", "fullname email role")
        .populate("assignedTo", "fullname email role")
        .sort({ lastMessageAt: -1 });
};
export const getSessionMessages = async ({ sessionId, user, }) => {
    const session = await ChatSession.findById(sessionId);
    if (!session)
        throw new AppError("Session not found", 404);
    const isSupport = user.role === "cso" || user.role === "admin";
    // Customers can only access their own sessions
    if (!isSupport && session.customer.toString() !== user._id.toString())
        throw new AppError("Unauthorized", 401);
    return ChatMessage.find({ session: sessionId })
        .populate("sender", "fullname email")
        .sort({ createdAt: 1 });
};
export const sendMessage = async ({ sessionId, sender, senderRole, message, }) => {
    const session = await ChatSession.findById(sessionId);
    if (!session)
        throw new AppError("Session not found", 404);
    if (session.status === "closed")
        throw new AppError("Chat session is closed", 400);
    const chatMessage = await ChatMessage.create({
        session: sessionId,
        sender,
        senderRole,
        message,
    });
    // Update session metadata
    session.lastMessage = message;
    session.lastMessageAt = new Date();
    if (senderRole === "customer")
        session.unreadCountCSO += 1;
    else
        session.unreadCountCustomer += 1;
    await session.save();
    return chatMessage;
};
export const closeSession = async ({ sessionId, user, }) => {
    const session = await ChatSession.findById(sessionId);
    if (!session)
        throw new AppError("Session not found", 404);
    const isSupport = user.role === "cso" || user.role === "admin";
    // Customers can only close their own chats
    if (!isSupport && session.customer.toString() !== user._id.toString())
        throw new AppError("Unauthorized", 401);
    session.status = "closed";
    session.closedAt = new Date();
    await session.save();
    return session;
};
//# sourceMappingURL=chat.service.js.map