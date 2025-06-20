import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

// Check for required environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error("Missing required environment variables:", missingEnvVars);
  console.error(
    "Please set these environment variables in your Vercel project settings"
  );
}

import { config } from "../src/config/env";
import { logger, stream } from "../src/config/logger";
import { prisma } from "../src/config/database";
import routes from "../src/routes";
import { errorHandler, notFoundHandler } from "../src/middleware/errorHandler";

// Create Express app
const app = express();

/**
 * Security Middleware
 */
// Helmet for various security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: true, // Allow all origins for mobile APK compatibility
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      message: "Too many requests from this IP, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

/**
 * Middleware
 */
// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// HTTP request logging
if (config.env !== "test") {
  const morgan = require("morgan");
  app.use(morgan("combined", { stream }));
}

// Trust proxy (important for rate limiting and getting real IPs)
app.set("trust proxy", 1);

/**
 * Routes
 */
app.use(routes);

/**
 * Error Handling
 */
// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Initialize database connection only once
let isInitialized = false;

const initializeApp = async () => {
  if (isInitialized) return;

  try {
    // Check if we have the required environment variables
    if (missingEnvVars.length > 0) {
      logger.warn(
        "Skipping database initialization due to missing environment variables"
      );
      return;
    }

    await prisma.$connect();
    logger.info("Database connected successfully");

    // Clean up expired sessions on startup
    const { AuthService } = await import("../src/services/authService");
    await AuthService.cleanupExpiredSessions();

    isInitialized = true;
  } catch (error) {
    logger.error("Failed to initialize app", { error });
    // Don't throw error in serverless environment
  }
};

// Initialize the app when the module loads
initializeApp().catch((error) => {
  logger.error("Initialization error", { error });
});

// Export the Express app as a Vercel serverless function
export default app;
