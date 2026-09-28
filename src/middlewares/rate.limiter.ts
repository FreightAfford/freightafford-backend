import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many authentication attempts. Try again later." },
});

export const locationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { message: "Too many location searches. Please slow down." },
});

export const commodityRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { message: "Too many commodity searches. Please slow down." },
});

export const vesselRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { message: "Too many vessel searches. Please slow down." },
});
