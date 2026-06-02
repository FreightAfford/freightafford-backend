import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import envConfig from "./configurations/env.configuration.js";
import { ROOMS, SOCKET_EVENTS } from "./configurations/events.js";
import { socketAuthMiddleware } from "./middlewares/auth/socket-auth.js";
import ChatSessionService from "./services/chat-session.service.js";
import { registerMessageHandlers } from "./utils/message-handler.js";
import { registerPresenceHandlers } from "./utils/presence-handler.js";
import { registerSessionHandlers } from "./utils/session-handler.js";

// ─── Socket Server Initialiser ────────────────────────────────────────────────
//
// Call this once in your server entry point, passing the http.Server instance.
//
// Usage in server.ts / app.ts:
//   import { initSocketServer } from "./socket";
//   const httpServer = app.listen(PORT);
//   initSocketServer(httpServer);
// ─────────────────────────────────────────────────────────────────────────────

let io: SocketServer;

export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: ["http://localhost:5173", envConfig.CLIENT_URL], // allow both local dev and production origins
      methods: ["GET", "POST"],
      credentials: true, // required for cookie-based auth
    },
    // Increase ping timeout for slow networks (logistics clients may be on
    // mobile in areas with poor connectivity)
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Auth middleware runs before every connection ───────────────────────────
  io.use(socketAuthMiddleware);

  // ── Register per-socket handlers on connection ────────────────────────────
  io.on("connection", (socket) => {
    const user = socket.data.user;
    const userId = user._id.toString();
    const isCSO = user.role === "admin";

    console.log(
      `[Socket] Connected: ${user.fullname} (${user.role}) — ${socket.id}`,
    );

    // Register all handler groups
    registerPresenceHandlers(io, socket);
    registerSessionHandlers(io, socket);
    registerMessageHandlers(io, socket);

    // ── New session notification (triggered after REST createSession) ─────
    // When a customer creates a session via REST, the server needs to notify
    // the cso:lobby. The customer's socket emits this event right after the
    // HTTP response returns the new sessionId.
    socket.on(
      SOCKET_EVENTS.CHAT_NEW_SESSION,
      async ({ sessionId }: { sessionId: string }) => {
        try {
          if (isCSO) return; // CSOs don't create sessions

          const session = await ChatSessionService.getSessionById(
            sessionId,
            userId,
            "customer",
          );

          // Broadcast new waiting session to all online CSOs
          io.to(ROOMS.CSO_LOBBY).emit(SOCKET_EVENTS.CHAT_NEW_SESSION, {
            sessionId: session._id,
            type: session.type,
            customer: {
              _id: userId,
              fullname: user.fullname,
            },
            queuePosition: session.queuePosition,
            freightRequest: session.freightRequest ?? null,
            booking: session.booking ?? null,
            createdAt: session.createdAt,
          });
        } catch (error: any) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: SOCKET_EVENTS.CHAT_NEW_SESSION,
            message: error.message ?? "Failed to notify CSOs",
          });
        }
      },
    );

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: ${user.fullname} — ${reason}`);
    });
  });

  console.log("[Socket] Socket.io server initialised");
  return io;
};

// Exported so other modules (e.g. REST controllers) can emit events
// directly without going through a socket connection
export const getIO = (): SocketServer => {
  if (!io)
    throw new Error("Socket.io not initialised. Call initSocketServer first.");
  return io;
};
