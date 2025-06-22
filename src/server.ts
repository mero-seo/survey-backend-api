import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";

import { config } from "@/config/env";
import { logger, stream } from "@/config/logger";
import { prisma } from "@/config/database";
import routes from "@/routes";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { apiLimiter } from "@/middleware/rateLimiter";

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

const port = config.port || 3001;

// Start the server only if this file is run directly
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });
}

export default app;
