/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    details?: any,
    code?: string,
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    if (code !== undefined) {
      this.code = code;
    }
    this.details = details;
    this.isOperational = isOperational;

    // Maintain proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: any): AppError {
    return new AppError(message, 400, details, "VALIDATION_ERROR");
  }

  /**
   * Create an authentication error
   */
  static unauthorized(message: string = "Authentication required"): AppError {
    return new AppError(message, 401, null, "UNAUTHORIZED");
  }

  /**
   * Create an authorization error
   */
  static forbidden(message: string = "Insufficient permissions"): AppError {
    return new AppError(message, 403, null, "FORBIDDEN");
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string = "Resource"): AppError {
    return new AppError(`${resource} not found`, 404, null, "NOT_FOUND");
  }

  /**
   * Create a conflict error
   */
  static conflict(message: string): AppError {
    return new AppError(message, 409, null, "CONFLICT");
  }

  /**
   * Create a rate limit error
   */
  static rateLimitExceeded(message: string = "Too many requests"): AppError {
    return new AppError(message, 429, null, "RATE_LIMIT_EXCEEDED");
  }

  /**
   * Create a server error
   */
  static internal(message: string = "Internal server error"): AppError {
    return new AppError(message, 500, null, "INTERNAL_ERROR", false);
  }

  /**
   * Create a service unavailable error
   */
  static serviceUnavailable(
    message: string = "Service temporarily unavailable"
  ): AppError {
    return new AppError(message, 503, null, "SERVICE_UNAVAILABLE");
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): object {
    return {
      error: {
        message: this.message,
        code: this.code,
        details: this.details,
        statusCode: this.statusCode,
      },
    };
  }
}
