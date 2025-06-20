process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

import { config } from "@/config/env";
import { logger, stream } from "@/config/logger";
import { prisma } from "@/config/database";
import routes from "@/routes";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";

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

/**
 * Database Connection and Server Startup
 */
const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info("Database connected successfully");

    // Clean up expired sessions on startup
    const { AuthService } = await import("@/services/authService");
    await AuthService.cleanupExpiredSessions();

    // Start server
    const port = config.port;
    const server = app.listen(port, () => {
      logger.info(`Server running on port ${port} in ${config.env} mode`);
      logger.info(
        `API Documentation: http://localhost:${port}/api/${config.apiVersion}/docs`
      );
      logger.info(`Health Check: http://localhost:${port}/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info("HTTP server closed");

        try {
          await prisma.$disconnect();
          logger.info("Database disconnected");
          process.exit(0);
        } catch (error) {
          logger.error("Error during database disconnection", { error });
          process.exit(1);
        }
      });
    };

    // Handle termination signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
      logger.error("Unhandled Rejection at:", { promise, reason });
      gracefulShutdown("UNHANDLED_REJECTION");
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      logger.error("Uncaught Exception:", { error });
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

export { app, startServer };
export default app;
