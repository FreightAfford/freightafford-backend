import { Router } from "express";
import ChatMessageController from "../controllers/chat-message.controller.js";
import ChatSessionController from "../controllers/chat-session.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import catchAsync from "../utils/catch-async.js";

const chatRouter = Router();

chatRouter.use(authenticate);

// Customer creates a session
chatRouter.post(
  "/sessions",
  authorize("customer"),
  catchAsync(ChatSessionController.createSession),
);

// CSO gets all sessions with optional status filter
chatRouter.get(
  "/sessions",
  authorize("cso", "admin"),
  catchAsync(ChatSessionController.getAllSessions),
);

// Customer gets their own sessions
chatRouter.get(
  "/sessions/mine",
  authorize("customer"),
  catchAsync(ChatSessionController.getMySessions),
);

// CSO gets list of available CSOs for reassignment dropdown
// Defined before /:sessionId to avoid route conflict
chatRouter.get(
  "/sessions/csos",
  authorize("cso", "admin"),
  catchAsync(ChatSessionController.getAvailableCSOs),
);

// Bulk unread counts for CSO dashboard sidebar
// Defined before /:sessionId to avoid route conflict
chatRouter.post(
  "/sessions/unread-counts",
  authorize("admin", "cso"),
  catchAsync(ChatMessageController.getBulkUnreadCounts),
);

// Both CSO and customer can view a single session
chatRouter.get(
  "/sessions/:sessionId",
  catchAsync(ChatSessionController.getSessionById),
);

// ── Session Lifecycle ─────────────────────────────────────────────────────────

chatRouter.patch(
  "/sessions/:sessionId/accept",
  authorize("admin", "cso"),
  catchAsync(ChatSessionController.acceptSession),
);

// Both CSO and customer can close a session
chatRouter.patch(
  "/sessions/:sessionId/close",
  catchAsync(ChatSessionController.closeSession),
);

chatRouter.patch(
  "/sessions/:sessionId/reassign",
  authorize("admin", "cso"),
  catchAsync(ChatSessionController.reassignSession),
);

// ── Messages (nested under session) ──────────────────────────────────────────

chatRouter.get(
  "/sessions/:sessionId/messages",
  catchAsync(ChatMessageController.getMessages),
);

chatRouter.patch(
  "/sessions/:sessionId/messages/read",
  catchAsync(ChatMessageController.markAsRead),
);

chatRouter.get(
  "/sessions/:sessionId/messages/unread",
  catchAsync(ChatMessageController.getUnreadCount),
);

export default chatRouter;
