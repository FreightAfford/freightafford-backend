import { Types } from "mongoose";
import ChatMessage from "../models/chat-message.model.js";
import ChatSession, {
  type IChatSession,
} from "../models/chat-session.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import QueueService from "./queue.service.js";

export interface CreateSessionPayload {
  customerId: string;
  type: "general" | "request_linked";
  freightRequestId?: string;
  bookingId?: string;
}

export interface SessionWithContext extends IChatSession {
  unreadCount?: number;
}

const writeSystemMessage = async (
  sessionId: string | Types.ObjectId,
  senderId: string | Types.ObjectId,
  content: string,
): Promise<void> => {
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
  createSession: async (
    payload: CreateSessionPayload,
  ): Promise<{ session: IChatSession; queuePosition: number }> => {
    const { customerId, type, freightRequestId, bookingId } = payload;

    if (type === "request_linked") {
      if (!freightRequestId) {
        throw new Error(
          "freightRequestId is required for request_linked sessions",
        );
      }

      const freightRequest = await FreightRequest.findOne({
        _id: freightRequestId,
        customer: customerId,
      });

      if (!freightRequest)
        throw new Error(
          `Freight request not found or does not belong to this customer`,
        );
    }
    if (type === "request_linked" && freightRequestId) {
      const existingSession = await ChatSession.findOne({
        customer: customerId,
        freightRequest: freightRequestId,
        status: { $in: ["waiting", "active"] },
      });

      if (existingSession)
        throw new Error(
          "An active or waiting chat session already exists for this request",
        );
    }

    const session = await ChatSession.create({
      type,
      customer: customerId,
      freightRequest: freightRequestId ?? null,
      booking: bookingId ?? null,
      status: "waiting",
    });

    const queuePosition = await QueueService.assignPosition(
      session._id.toString(),
    );

    return { session, queuePosition };
  },

  acceptSession: async (
    sessionId: string,
    csoId: string,
  ): Promise<{
    session: IChatSession;
    updatedQueue: Awaited<ReturnType<typeof QueueService.recalculateQueue>>;
  }> => {
    const session = await ChatSession.findById(sessionId);

    if (!session) throw new Error("Session not found");
    if (session.status !== "waiting")
      throw new Error(`Cannot accept a session with status: ${session.status}`);

    session.status = "active";
    session.assignedCSO = new Types.ObjectId(csoId);
    session.queuePosition = 0;
    session.metadata.acceptedAt = new Date();
    await session.save();

    const cso = await User.findById(csoId, "fullname");
    await writeSystemMessage(
      session._id,
      csoId,
      `${cso?.fullname ?? "Support"} has joined the chat.`,
    );

    const updatedQueue = await QueueService.recalculateQueue();

    return { session, updatedQueue };
  },
  closeSession: async (
    sessionId: string,
    closedById: string,
    closedByRole: "customer" | "cso",
  ): Promise<{
    session: IChatSession;
    updatedQueue: Awaited<ReturnType<
      typeof QueueService.recalculateQueue
    > | null>;
  }> => {
    const session = await ChatSession.findById(sessionId);

    if (!session) throw new Error("Session not found");
    if (session.status === "closed")
      throw new Error("Session is already closed");

    const wasWaiting = session.status === "waiting";

    session.status = "closed";
    session.metadata.closedAt = new Date();
    session.metadata.closedBy = new Types.ObjectId(closedById);
    session.queuePosition = 0;
    await session.save();

    const closer = await User.findById(closedById, "fullname");
    const closerLabel =
      closedByRole === "cso"
        ? `${closer?.fullname ?? "Support"}`
        : "the customer";

    await writeSystemMessage(
      session._id,
      closedById,
      `Chat was closed by ${closerLabel}`,
    );

    const updatedQueue = wasWaiting
      ? await QueueService.recalculateQueue()
      : null;

    return { session, updatedQueue };
  },

  reassignSession: async (
    sessionId: string,
    fromCSOId: string,
    toCSOId: string,
  ): Promise<{
    session: IChatSession;
    updatedQueue: Awaited<ReturnType<typeof QueueService.recalculateQueue>>;
  }> => {
    const session = await ChatSession.findById(sessionId);

    if (!session) throw new Error("Session not found");
    if (session.status !== "active")
      throw new Error("Only active sessions can be reassigned");

    const targetCSO = await User.findOne({
      _id: toCSOId,
      role: "admin",
      status: "active",
    });

    if (!targetCSO) throw new Error("Target CSO not found or is not active");

    session.metadata.previousCSOId = new Types.ObjectId(fromCSOId);
    session.metadata.reassignedAt = new Date();

    session.status = "waiting";
    session.assignedCSO = new Types.ObjectId(toCSOId);

    await session.save();

    await QueueService.assignPosition(session._id.toString());

    const fromCSO = await User.findById(fromCSOId, "fullname");
    await writeSystemMessage(
      session._id,
      fromCSOId,
      `Chat was reassigned to ${targetCSO.fullname} by ${fromCSO?.fullname ?? "Support"}`,
    );

    const updatedQueue = await QueueService.recalculateQueue();
    return { session, updatedQueue };
  },

  getAllSessions: async (
    filters: {
      status?: IChatSession["status"] | IChatSession["status"][];
      csoId?: string;
    },
    pagination: { page: number; limit: number },
  ): Promise<{ sessions: IChatSession[]; total: number }> => {
    const { status, csoId } = filters;
    const { page, limit } = pagination;

    const query: Record<string, unknown> = {};

    if (status) query.status = Array.isArray(status) ? { $in: status } : status;
    if (csoId) query.assignedCSO = csoId;

    const [sessions, total] = await Promise.all([
      ChatSession.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customer", "fullname email companyName")
        .populate(
          "freightRequest",
          "originPort destinationPort status containerSize",
        )
        .populate("booking", "bookingNumber vessel status"),
      ChatSession.countDocuments(query),
    ]);

    return { sessions, total };
  },

  getSessionById: async (
    sessionId: string,
    requesterId: string,
    requesterRole: "customer" | "cso",
  ): Promise<IChatSession> => {
    const session = await ChatSession.findById(sessionId)
      .populate("customer", "fullname email phoneNumber companyName status")
      .populate(
        "freightRequest",
        "originPort destinationPort status containerSize containerQuantity proposedPrice adminCounterPrice",
      )
      .populate(
        "booking",
        "bookingNumber vessel sailingDate status shippingLine",
      )
      .populate("assignedCSO", "fullname email");

    if (!session) throw new Error("Session not found");

    // Customers can only view their own sessions
    if (
      requesterRole === "customer" &&
      session.customer._id.toString() !== requesterId
    ) {
      throw new Error("Unauthorized");
    }

    return session;
  },
  getCustomerSessions: async (
    customerId: string,
    status?: IChatSession["status"],
  ): Promise<IChatSession[]> => {
    const query: Record<string, unknown> = { customer: customerId };
    if (status) query.status = status;

    return ChatSession.find(query)
      .sort({ createdAt: -1 })
      .populate("freightRequest", "originPort destinationPort status")
      .populate("booking", "bookingNumber status")
      .populate("assignedCSO", "fullname email");
  },

  getAvailableCSOs: async (excludeCSOId: string): Promise<(typeof User)[]> => {
    return User.find(
      {
        role: "admin",
        status: "active",
        _id: { $ne: excludeCSOId },
      },
      "fullname email",
    ) as unknown as (typeof User)[];
  },
};

export default ChatSessionService;
