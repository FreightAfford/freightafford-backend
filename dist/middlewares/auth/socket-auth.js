// ─── Socket Auth Middleware ───────────────────────────────────────────────────
//
// Mirrors your HTTP authenticate middleware exactly.
// Runs once per socket connection during the handshake phase —
// before any event handlers fire.
//
// Token extraction order (same as HTTP middleware):
//   1. Authorization: Bearer <token>  (from socket.handshake.auth.token)
//   2. Cookie: jwt=<token>            (from socket.handshake.headers.cookie)
//
// On success: attaches the full user document to socket.data.user
// On failure: calls next() with an Error — Socket.io rejects the connection
// ─────────────────────────────────────────────────────────────────────────────
import jwt from "jsonwebtoken";
import envConfig from "../../configurations/env.configuration.js";
import User from "../../models/user.model.js";
export const socketAuthMiddleware = async (socket, next) => {
    try {
        let token;
        // ── 1. Try Authorization header (sent via socket.handshake.auth) ─────────
        // Frontend connects like:
        //   const socket = io(URL, { auth: { token: "Bearer <jwt>" } })
        //   or: { auth: { token: "<jwt>" } }  (we handle both formats)
        const authToken = socket.handshake.auth?.token;
        if (authToken) {
            token = authToken.startsWith("Bearer ")
                ? authToken.split(" ")[1]
                : authToken;
        }
        // ── 2. Fallback: HTTP-only cookie ─────────────────────────────────────────
        if (!token) {
            const cookieHeader = socket.handshake.headers.cookie;
            if (cookieHeader) {
                const jwtCookie = cookieHeader
                    .split(";")
                    .map((c) => c.trim())
                    .find((c) => c.startsWith("jwt="));
                if (jwtCookie)
                    token = jwtCookie.split("=")[1];
            }
        }
        if (!token)
            return next(new Error("Authentication required"));
        // ── Verify token ──────────────────────────────────────────────────────────
        let decoded;
        try {
            decoded = jwt.verify(token, envConfig.JWT_SECRET);
        }
        catch {
            return next(new Error("Invalid or expired token"));
        }
        // ── Load and validate user ────────────────────────────────────────────────
        const user = await User.findById(decoded.userId);
        if (!user)
            return next(new Error("User no longer exists"));
        if (!user.isEmailVerified)
            return next(new Error("Account not verified"));
        if (user.status !== "active")
            return next(new Error("Account is suspended or inactive"));
        // ── Attach user to socket ─────────────────────────────────────────────────
        socket.data.user = user;
        next();
    }
    catch {
        next(new Error("Authentication failed"));
    }
};
//# sourceMappingURL=socket-auth.js.map