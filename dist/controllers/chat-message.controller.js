import AppError from "../errors/app.error.js";
import MessageService from "../services/chat-message.service.js";
const ChatMessageController = {
    getMessages: async (req, res, next) => {
        const { sessionId } = req.params;
        const { page = "1", limit = "30" } = req.query;
        const requesterId = req.user?._id.toString();
        const requesterRole = req.user?.role === "admin" ? "cso" : "customer";
        const result = await MessageService.getMessages(sessionId, requesterId, requesterRole, parseInt(page), parseInt(limit));
        res.status(200).json({
            status: "success",
            data: result,
        });
    },
    markAsRead: async (req, res, next) => {
        const { sessionId } = req.params;
        const readerId = req.user?._id.toString();
        const updatedCount = await MessageService.markAsRead(sessionId, readerId);
        res.status(200).json({
            status: "success",
            message: `${updatedCount} message(s) marked as read`,
            data: { updatedCount },
        });
    },
    getUnreadCount: async (req, res, next) => {
        const { sessionId } = req.params;
        const userId = req.user?._id.toString();
        const count = await MessageService.getUnreadCount(sessionId, userId);
        res.status(200).json({
            status: "success",
            data: { unreadCount: count },
        });
    },
    getBulkUnreadCounts: async (req, res, next) => {
        const { sessionIds } = req.body;
        const userId = req.user?._id.toString();
        if (!Array.isArray(sessionIds) || sessionIds.length === 0)
            return next(new AppError("sessionIds must be a non-empty array", 400));
        if (sessionIds.length > 100)
            return next(new AppError("Too many sessionIds. Maximum allowed is 100.", 400));
        const counts = await MessageService.getBulkUnreadCounts(sessionIds, userId);
        res.status(200).json({
            status: "success",
            data: { counts },
        });
    },
};
export default ChatMessageController;
//# sourceMappingURL=chat-message.controller.js.map