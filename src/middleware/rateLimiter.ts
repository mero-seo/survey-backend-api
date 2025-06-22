import rateLimit from "express-rate-limit";

// General API rate limiter (more lenient)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  message: {
    success: false,
    error: {
      message:
        "Too many requests from this IP, please try again after 15 minutes.",
      code: "RATE_LIMIT_EXCEEDED",
    },
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for authentication routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  message: {
    success: false,
    error: {
      message:
        "Too many login attempts from this IP, please try again after 15 minutes.",
      code: "TOO_MANY_LOGIN_ATTEMPTS",
    },
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});
