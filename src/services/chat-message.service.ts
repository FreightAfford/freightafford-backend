import { Types } from "mongoose";
import ChatMessage, { type IMessage } from "../models/chat-message.model.js";
import ChatSession from "../models/chat-session.model.js";

export interface SendMessagePayload {
  sessionId: string;
  senderId: string;
  content: string;
  senderRole: "customer" | "cso";
}

export interface PaginatedMessages {
  messages: IMessage[];
  hasMore: boolean;
  total: number;
  page: number;
  totalPages: number;
}

const MessageService = {
  // Send Message
  // Validates the session is active before saving the message.
  // Returns the saved message so the socket layer can broadcast it
  // to the session room immediately after.

  sendMessage: async (payload: SendMessagePayload): Promise<IMessage> => {
    const { sessionId, senderId, content, senderRole } = payload;

    const session = await ChatSession.findById(sessionId);
    if (!session) throw new Error("Chat session not found");

    // Only active sessions can receive new text messages
    if (session.status !== "active") {
      throw new Error(
        `Cannot send messages to a session with status: ${session.status}`,
      );
    }

    // Confirm the sender is a participant in this session
    const isCustomer =
      senderRole === "customer" && session.customer.toString() === senderId;

    const isCSO =
      senderRole === "cso" && session.assignedCSO?.toString() === senderId;

    if (!isCustomer && !isCSO) {
      throw new Error("Sender is not a participant in this session");
    }

    const message = await ChatMessage.create({
      session: sessionId,
      sender: senderId,
      senderRole,
      content: content.trim(),
      type: "text",
      status: "sent",
    });

    return message;
  },
  // ── Get Paginated Messages ─────────────────────────────────────────────────
  //
  // Fetches message history for a session with cursor-based pagination.
  // Newest messages first (to support "load more" scrolling upward).
  // Page 1 = most recent messages.
  //
  getMessages: async (
    sessionId: string,
    requesterId: string,
    requesterRole: "customer" | "cso",
    page: number = 1,
    limit: number = 30,
  ): Promise<PaginatedMessages> => {
    const session = await ChatSession.findById(sessionId);
    if (!session) throw new Error("Session not found");

    // Customers can only read messages from their own sessions
    if (
      requesterRole === "customer" &&
      session.customer.toString() !== requesterId
    ) {
      throw new Error("Unauthorized");
    }

    const [messages, total] = await Promise.all([
      ChatMessage.find({ session: sessionId })
        .sort({ createdAt: -1 }) // newest first
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("sender", "fullname role"),
      ChatMessage.countDocuments({ session: sessionId }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      messages: messages.reverse(), // return in chronological order to the client
      total,
      page,
      totalPages,
      hasMore: page < totalPages,
    };
  },

  // ── Mark Messages as Delivered ─────────────────────────────────────────────
  //
  // Called by the socket layer when the recipient's socket connects to
  // the session room — meaning they are online and have received the messages.
  // Only updates messages NOT sent by the recipient (you can't deliver
  // your own messages to yourself).
  //
  markAsDelivered: async (
    sessionId: string,
    recipientId: string,
  ): Promise<number> => {
    const result = await ChatMessage.updateMany(
      {
        session: sessionId,
        sender: { $ne: recipientId }, // not sent by the recipient
        status: "sent", // only upgrade "sent" → "delivered"
      },
      { $set: { status: "delivered" } },
    );

    return result.modifiedCount;
  },

  // ── Mark Messages as Read ──────────────────────────────────────────────────
  //
  // Called when the recipient opens/focuses the chat window.
  // Upgrades "delivered" → "read" for all messages not sent by them.
  // Returns the count of updated messages so the socket layer knows
  // whether to emit a read receipt event.
  //
  markAsRead: async (sessionId: string, readerId: string): Promise<number> => {
    const result = await ChatMessage.updateMany(
      {
        session: sessionId,
        sender: { $ne: readerId }, // not sent by the reader
        status: { $in: ["sent", "delivered"] }, // upgrade both states
      },
      { $set: { status: "read" } },
    );

    return result.modifiedCount;
  },

  // ── Get Unread Count ───────────────────────────────────────────────────────
  //
  // Returns the unread message count for a session for a specific user.
  // Powers the unread badge in ChatSidebar.
  //
  getUnreadCount: async (
    sessionId: string,
    userId: string,
  ): Promise<number> => {
    return ChatMessage.countDocuments({
      session: sessionId,
      sender: { $ne: userId },
      status: { $in: ["sent", "delivered"] },
    });
  },

  // ── Get Unread Counts for Multiple Sessions ────────────────────────────────
  //
  // Used by the CSO dashboard on initial load to populate all unread
  // badges in the sidebar at once — avoids N+1 queries.
  //
  getBulkUnreadCounts: async (
    sessionIds: string[],
    userId: string,
  ): Promise<Record<string, number>> => {
    const results = await ChatMessage.aggregate([
      {
        $match: {
          session: {
            $in: sessionIds.map((id) => new Types.ObjectId(id)),
          },
          sender: { $ne: new Types.ObjectId(userId) },
          status: { $in: ["sent", "delivered"] },
        },
      },
      {
        $group: {
          _id: "$session",
          count: { $sum: 1 },
        },
      },
    ]);

    // Build a map of sessionId → unreadCount, defaulting to 0
    const countMap: Record<string, number> = {};
    for (const sessionId of sessionIds) {
      countMap[sessionId] = 0;
    }
    for (const result of results) {
      countMap[result._id.toString()] = result.count;
    }

    return countMap;
  },
};

export default MessageService;
