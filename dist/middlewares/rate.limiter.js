import rateLimit from "express-rate-limit";
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { message: "Too many authentication attempts. Try again later." },
});
//# sourceMappingURL=rate.limiter.js.map