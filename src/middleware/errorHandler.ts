import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "../config/logger";
import { config } from "../config/env";
import { AppError } from "../utils/appError";
import { ValidationError } from "joi";

/**
 * Error response interface
 */
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string | undefined;
    details?: any;
    stack?: string | undefined;
  };
  timestamp: string;
  path: string;
}

/**
 * Handle Prisma errors
 */
const handlePrismaError = (
  error: Prisma.PrismaClientKnownRequestError
): AppError => {
  switch (error.code) {
    case "P2002":
      // Unique constraint failed
      const target = error.meta?.target as string[] | undefined;
      const field = target?.[0] || "field";
      return new AppError(`${field} already exists`, 409);

    case "P2025":
      // Record not found
      return new AppError("Record not found", 404);

    case "P2003":
      // Foreign key constraint failed
      return new AppError("Referenced record does not exist", 400);

    case "P2014":
      // Invalid ID
      return new AppError("Invalid ID provided", 400);

    case "P2015":
      // Related record not found
      return new AppError("Related record not found", 404);

    case "P2021":
      // Table does not exist
      return new AppError("Database table does not exist", 500);

    case "P2022":
      // Column does not exist
      return new AppError("Database column does not exist", 500);

    default:
      logger.error("Unhandled Prisma error", { code: error.code, error });
      return new AppError("Database operation failed", 500);
  }
};

/**
 * Handle Joi validation errors
 */
const handleValidationError = (error: ValidationError): AppError => {
  const details = error.details.map((detail) => ({
    field: detail.path.join("."),
    message: detail.message,
    value: detail.context?.value,
  }));

  return new AppError("Validation failed", 400, details);
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error: Error): AppError => {
  if (error.name === "JsonWebTokenError") {
    return new AppError("Invalid token", 401);
  }
  if (error.name === "TokenExpiredError") {
    return new AppError("Token expired", 401);
  }
  return new AppError("Authentication failed", 401);
};

/**
 * Send error response
 */
const sendErrorResponse = (
  res: Response,
  error: AppError,
  req: Request
): void => {
  const response: ErrorResponse = {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      details: error.details,
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  // Include stack trace in development
  if (config.env === "development") {
    response.error.stack = error.stack;
  }

  // Log error details
  logger.error("Error response sent", {
    statusCode: error.statusCode,
    message: error.message,
    code: error.code,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    userId: req.user?.id,
    stack: error.stack,
  });

  res.status(error.statusCode).json(response);
};

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let appError: AppError;

  // Handle different types of errors
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    appError = new AppError("Invalid data provided", 400);
  } else if (error.name === "ValidationError") {
    appError = handleValidationError(error as ValidationError);
  } else if (
    error.name === "JsonWebTokenError" ||
    error.name === "TokenExpiredError"
  ) {
    appError = handleJWTError(error);
  } else if (error.name === "MulterError") {
    // Handle file upload errors
    appError = new AppError("File upload error: " + error.message, 400);
  } else if (error.name === "SyntaxError" && "body" in error) {
    // Handle JSON parsing errors
    appError = new AppError("Invalid JSON in request body", 400);
  } else {
    // Unknown error
    logger.error("Unknown error occurred", { error });
    appError = new AppError(
      config.env === "production" ? "Internal server error" : error.message,
      500
    );
  }

  sendErrorResponse(res, appError, req);
};

/**
 * Handle async errors in route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle 404 errors
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Handle uncaught exceptions
 */
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception", { error });
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  logger.error("Unhandled Rejection", { reason, promise });
  process.exit(1);
});
