import { Types } from "mongoose";
import ChatMessage from "../models/chat-message.model.js";
import ChatSession, {
  type IChatSession,
} from "../models/chat-session.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import { sendChatInitiatedNotification } from "./chat-notification.service.js";
import QueueService from "./queue.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSessionPayload {
  customerId: string;
  type: "general" | "request_linked";
  freightRequestId?: string;
  bookingId?: string;
}

export interface SessionWithContext extends IChatSession {
  unreadCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Service ──────────────────────────────────────────────────────────────────

const ChatSessionService = {
  // ── Create Session ─────────────────────────────────────────────────────────
  //
  // Order of operations:
  //   1. Validate payload
  //   2. Guard duplicate sessions
  //   3. Send email to CSOs — BLOCKS session creation if email fails
  //   4. Create session in DB
  //   5. Assign queue position
  //   6. Return fully populated session (freightRequest + booking as objects,
  //      not raw ObjectIds — fixes the frontend display bug)
  //
  createSession: async (
    payload: CreateSessionPayload,
  ): Promise<{ session: IChatSession; queuePosition: number }> => {
    const { customerId, type, freightRequestId, bookingId } = payload;

    // ── Validate ──────────────────────────────────────────────────────────────
    let freightRequestDoc: InstanceType<typeof FreightRequest> | null = null;

    if (type === "request_linked") {
      if (!freightRequestId) {
        throw new Error(
          "freightRequestId is required for request_linked sessions",
        );
      }

      freightRequestDoc = await FreightRequest.findOne({
        _id: freightRequestId,
        customer: customerId,
      });

      if (!freightRequestDoc) {
        throw new Error(
          "Freight request not found or does not belong to this customer",
        );
      }
    }

    // ── Duplicate guard ───────────────────────────────────────────────────────
    if (type === "request_linked" && freightRequestId) {
      const existingSession = await ChatSession.findOne({
        customer: customerId,
        freightRequest: freightRequestId,
        status: { $in: ["waiting", "active"] },
      });

      if (existingSession) {
        throw new Error(
          "An active or waiting chat session already exists for this request",
        );
      }
    }

    // ── Send email notification — blocks if it fails ───────────────────────
    // Load customer details for the email
    const customer = await User.findById(customerId, "fullname email");
    if (!customer) throw new Error("Customer not found");

    console.log("[CHAT EMAIL] Attempting to send to CSOs...");
    const { error: emailError } = await sendChatInitiatedNotification({
      customerName: customer.fullname,
      customerEmail: customer.email,
      sessionType: type,
      originPort: freightRequestDoc?.originPort,
      destinationPort: freightRequestDoc?.destinationPort,
      commodity: freightRequestDoc?.commodity,
    });
    console.log("[CHAT EMAIL] Result:", emailError ?? "SUCCESS");
    if (emailError) {
      throw new Error("Unable to send chat notification email");
    }

    // ── Create session ────────────────────────────────────────────────────────
    const session = await ChatSession.create({
      type,
      customer: customerId,
      freightRequest: freightRequestId ?? null,
      booking: bookingId ?? null,
      status: "waiting",
    });

    // ── Assign queue position ─────────────────────────────────────────────────
    const queuePosition = await QueueService.assignPosition(
      session._id.toString(),
    );

    // ── Populate and return ───────────────────────────────────────────────────
    // ChatSession.create() returns the raw document — freightRequest and booking
    // are plain ObjectIds. Populate them so the frontend receives full objects
    // instead of IDs, fixing the blank ChatContextPanel bug.
    const populatedSession = await ChatSession.findById(session._id)
      .populate("customer", "fullname email phoneNumber companyName status")
      .populate(
        "freightRequest",
        "originPort destinationPort status containerSize containerQuantity proposedPrice adminCounterPrice",
      )
      .populate(
        "booking",
        "bookingNumber vessel sailingDate status shippingLine",
      );

    return { session: populatedSession as IChatSession, queuePosition };
  },

  // ── Accept Session (CSO) ───────────────────────────────────────────────────
  //
  // CSO clicks "Accept Chat" in ChatContextPanel.
  // Transitions session from "waiting" → "active".
  // Triggers queue recalculation for all remaining waiting sessions.
  // Returns updated queue for socket broadcasting.
  //
  acceptSession: async (
    sessionId: string,
    csoId: string,
  ): Promise<{
    session: IChatSession;
    updatedQueue: Awaited<ReturnType<typeof QueueService.recalculateQueue>>;
  }> => {
    const session = await ChatSession.findById(sessionId);

    if (!session) throw new Error("Session not found");
    if (session.status !== "waiting") {
      throw new Error(`Cannot accept a session with status: ${session.status}`);
    }

    session.status = "active";
    session.assignedCSO = new Types.ObjectId(csoId);
    session.queuePosition = 0; // no longer in queue
    session.metadata.acceptedAt = new Date();
    await session.save();

    // Write system message so the customer sees "Support has joined the chat"
    const cso = await User.findById(csoId, "fullname");
    await writeSystemMessage(
      session._id,
      csoId,
      `${cso?.fullname ?? "Support"} has joined the chat`,
    );

    // Recalculate queue positions for all remaining waiting sessions
    const updatedQueue = await QueueService.recalculateQueue();

    return { session, updatedQueue };
  },

  // ── Close Session ──────────────────────────────────────────────────────────
  //
  // Can be triggered by either the CSO ("Close Chat" button) or the customer.
  // If called on a "waiting" session (customer closes before being served),
  // it still triggers a queue recalculation since a spot opens up.
  //
  closeSession: async (
    sessionId: string,
    closedById: string,
    closedByRole: "customer" | "cso",
  ): Promise<{
    session: IChatSession;
    updatedQueue: Awaited<
      ReturnType<typeof QueueService.recalculateQueue>
    > | null;
  }> => {
    const session = await ChatSession.findById(sessionId);

    if (!session) throw new Error("Session not found");
    if (session.status === "closed") {
      throw new Error("Session is already closed");
    }

    const wasWaiting = session.status === "waiting";

    session.status = "closed";
    session.metadata.closedAt = new Date();
    session.metadata.closedBy = new Types.ObjectId(closedById);
    session.queuePosition = 0;
    await session.save();

    // Write system message to chat timeline
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

    // Only recalculate queue if this session was in the waiting queue
    // (closing an active session doesn't affect queue order)
    const updatedQueue = wasWaiting
      ? await QueueService.recalculateQueue()
      : null;

    return { session, updatedQueue };
  },

  // ── Reassign Session (CSO → CSO) ───────────────────────────────────────────
  //
  // CSO clicks "Reassign Chat" and picks a target CSO.
  // The session goes back to "waiting" (joins the back of the queue)
  // with previousCSOId recorded. The target CSO gets a personal notification
  // via their user:<userId> socket room.
  //
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
    if (session.status !== "active") {
      throw new Error("Only active sessions can be reassigned");
    }

    // Confirm target CSO exists and has admin role
    const targetCSO = await User.findOne({
      _id: toCSOId,
      role: "admin",
      status: "active",
    });

    if (!targetCSO) {
      throw new Error("Target CSO not found or is not active");
    }

    // Record handoff details before changing state
    session.metadata.previousCSOId = new Types.ObjectId(fromCSOId);
    session.metadata.reassignedAt = new Date();

    // Put back in waiting queue, targeted at the specific CSO
    // We still set it to "waiting" so it appears in the queue
    // The socket layer will send a direct notification to toCSOId
    session.status = "waiting";
    session.assignedCSO = new Types.ObjectId(toCSOId);

    await session.save();

    // Assign new queue position (goes to back of queue)
    await QueueService.assignPosition(session._id.toString());

    // Write system message
    const fromCSO = await User.findById(fromCSOId, "fullname");
    await writeSystemMessage(
      session._id,
      fromCSOId,
      `Chat was reassigned to ${targetCSO.fullname} by ${fromCSO?.fullname ?? "Support"}`,
    );

    // Recalculate queue for all waiting sessions
    const updatedQueue = await QueueService.recalculateQueue();

    return { session, updatedQueue };
  },

  // ── Get All Sessions (CSO Dashboard) ─────────────────────────────────────
  //
  // Returns paginated sessions for the CSO sidebar.
  // Supports filtering by status so the CSO can switch between
  // "waiting", "active", and "closed" tabs.
  //
  getAllSessions: async (
    filters: {
      status?: IChatSession["status"] | IChatSession["status"][];
      csoId?: string; // filter sessions assigned to a specific CSO
    },
    pagination: { page: number; limit: number },
  ): Promise<{ sessions: IChatSession[]; total: number }> => {
    const { status, csoId } = filters;
    const { page, limit } = pagination;

    const query: Record<string, unknown> = {};

    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    if (csoId) {
      query.assignedCSO = csoId;
    }

    const [sessions, total] = await Promise.all([
      ChatSession.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customer", "fullname email status companyName")
        .populate(
          "freightRequest",
          "originPort destinationPort status containerSize containerQuantity",
        )
        .populate(
          "booking",
          "bookingNumber vessel status sailingDate shippingLine",
        ),
      ChatSession.countDocuments(query),
    ]);

    return { sessions, total };
  },

  // ── Get Single Session ────────────────────────────────────────────────────
  //
  // Returns full session detail with all populated references.
  // Used when a CSO clicks on a session in the sidebar (ChatContextPanel).
  //
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

  // ── Get Customer's Own Sessions ───────────────────────────────────────────
  //
  // Returns a customer's chat history.
  // Used to restore an ongoing session when the customer refreshes.
  //
  getCustomerSessions: async (
    customerId: string,
    status?: IChatSession["status"],
  ): Promise<IChatSession[]> => {
    const query: Record<string, unknown> = { customer: customerId };
    if (status) query.status = status;

    return ChatSession.find(query)
      .sort({ createdAt: -1 })
      .populate(
        "freightRequest",
        "originPort destinationPort status containerSize",
      )
      .populate("booking", "bookingNumber status vessel");
  },

  // ── Get Available CSOs for Reassignment ───────────────────────────────────
  //
  // Returns list of active admin users for the reassign dropdown.
  // Excludes the current CSO since there's no point reassigning to yourself.
  //
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
