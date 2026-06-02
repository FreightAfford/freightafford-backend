import type { Server, Socket } from "socket.io";
import { ROOMS, SOCKET_EVENTS } from "../configurations/events.js";
import MessageService from "../services/chat-message.service.js";

// ─── Message Handler ──────────────────────────────────────────────────────────
//
// Handles all real-time messaging events:
//   - Sending and broadcasting messages
//   - Typing indicators (ephemeral, never saved to DB)
//   - Read receipts (triggers DB update + broadcast to sender)
//
// All text messages are persisted to DB before being broadcast.
// This guarantees message history survives disconnects.
// ─────────────────────────────────────────────────────────────────────────────

// Typing debounce tracker: prevents repeated "stop_typing" emits
// Structure: `${sessionId}:${userId}` → timeout handle
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TYPING_TIMEOUT_MS = 3000; // auto-stop typing after 3s of no keystrokes

export const registerMessageHandlers = (io: Server, socket: Socket): void => {
  const user = socket.data.user;
  const userId = user._id.toString();
  const senderRole = user.role === "admin" ? "cso" : "customer";

  // ── chat:message ──────────────────────────────────────────────────────────
  //
  // Client emits: { sessionId, content }
  // Server:
  //   1. Saves message to DB (status: "sent")
  //   2. Broadcasts to session room
  //   3. If recipient is in the room, immediately upgrades to "delivered"
  //
  socket.on(
    SOCKET_EVENTS.CHAT_MESSAGE,
    async ({ sessionId, content }: { sessionId: string; content: string }) => {
      try {
        if (!content?.trim()) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: SOCKET_EVENTS.CHAT_MESSAGE,
            message: "Message content cannot be empty",
          });
          return;
        }

        // Persist to DB first — if broadcast fails, message is not lost
        const message = await MessageService.sendMessage({
          sessionId,
          senderId: userId,
          senderRole,
          content,
        });

        // Check if the other participant is currently in the room
        const roomName = ROOMS.session(sessionId);
        const socketsInRoom = await io.in(roomName).fetchSockets();
        const recipientIsInRoom = socketsInRoom.some(
          (s) => s.data.user._id.toString() !== userId,
        );

        // If recipient is online in the room, upgrade to "delivered" immediately
        let finalStatus = message.status;
        if (recipientIsInRoom) {
          await MessageService.markAsDelivered(sessionId, userId);
          finalStatus = "delivered";
        }

        // Broadcast the saved message to everyone in the session room
        io.to(roomName).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
          _id: message._id,
          sessionId,
          sender: {
            _id: userId,
            fullname: user.fullname,
            role: user.role,
          },
          senderRole,
          content: message.content,
          type: message.type,
          status: finalStatus,
          createdAt: message.createdAt,
        });

        // Clear typing indicator for this user when they send
        const timerKey = `${sessionId}:${userId}`;
        const existingTimer = typingTimers.get(timerKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
          typingTimers.delete(timerKey);
          socket.to(roomName).emit(SOCKET_EVENTS.CHAT_STOP_TYPING, {
            sessionId,
            userId,
          });
        }
      } catch (error: any) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CHAT_MESSAGE,
          message: error.message ?? "Failed to send message",
        });
      }
    },
  );

  // ── chat:typing ───────────────────────────────────────────────────────────
  //
  // Client emits this on every keystroke.
  // Server broadcasts to others in the room (never back to sender).
  // Auto-stop fires after TYPING_TIMEOUT_MS if the client doesn't emit
  // chat:stop_typing explicitly (handles tab switches, crashes, etc.)
  //
  socket.on(
    SOCKET_EVENTS.CHAT_TYPING,
    ({ sessionId }: { sessionId: string }) => {
      const timerKey = `${sessionId}:${userId}`;
      const roomName = ROOMS.session(sessionId);

      // Reset auto-stop timer on every keystroke
      const existingTimer = typingTimers.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);

      socket.to(roomName).emit(SOCKET_EVENTS.CHAT_TYPING, {
        sessionId,
        userId,
        fullname: user.fullname,
      });

      // Auto-stop after timeout
      const timer = setTimeout(() => {
        socket.to(roomName).emit(SOCKET_EVENTS.CHAT_STOP_TYPING, {
          sessionId,
          userId,
        });
        typingTimers.delete(timerKey);
      }, TYPING_TIMEOUT_MS);

      typingTimers.set(timerKey, timer);
    },
  );

  // ── chat:stop_typing ──────────────────────────────────────────────────────
  //
  // Client emits this explicitly (e.g. on blur, on send).
  // Cancels the auto-stop timer and broadcasts immediately.
  //
  socket.on(
    SOCKET_EVENTS.CHAT_STOP_TYPING,
    ({ sessionId }: { sessionId: string }) => {
      const timerKey = `${sessionId}:${userId}`;
      const existingTimer = typingTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        typingTimers.delete(timerKey);
      }

      socket.to(ROOMS.session(sessionId)).emit(SOCKET_EVENTS.CHAT_STOP_TYPING, {
        sessionId,
        userId,
      });
    },
  );

  // ── chat:read ─────────────────────────────────────────────────────────────
  //
  // Client emits when the user opens / focuses the chat window.
  // Server marks all unread messages in the session as "read"
  // then notifies the sender their messages have been read.
  //
  socket.on(
    SOCKET_EVENTS.CHAT_READ,
    async ({ sessionId }: { sessionId: string }) => {
      try {
        const updatedCount = await MessageService.markAsRead(sessionId, userId);

        if (updatedCount > 0) {
          // Notify the other participant (the message sender) their messages were read
          socket
            .to(ROOMS.session(sessionId))
            .emit(SOCKET_EVENTS.CHAT_READ_RECEIPT, {
              sessionId,
              status: "read",
              byUserId: userId,
            });
        }
      } catch (error: any) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CHAT_READ,
          message: error.message ?? "Failed to mark messages as read",
        });
      }
    },
  );

  // ── Cleanup typing timers on disconnect ───────────────────────────────────
  socket.on("disconnect", () => {
    // Clear all typing timers for this socket to prevent memory leaks
    for (const [key] of typingTimers) {
      if (key.endsWith(`:${userId}`)) {
        const timer = typingTimers.get(key);
        if (timer) clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
  });
};
