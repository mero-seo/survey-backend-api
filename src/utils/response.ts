import { Response } from "express";

/**
 * Success response interface
 */
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    [key: string]: any;
  };
  timestamp: string;
}

/**
 * Pagination meta interface
 */
interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Send success response
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200,
  meta?: any
): void => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    response.message = message;
  }

  if (meta) {
    response.meta = meta;
  }

  res.status(statusCode).json(response);
};

/**
 * Send paginated response
 */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  message?: string
): void => {
  sendSuccess(res, data, message, 200, {
    pagination,
  });
};

/**
 * Send created response (201)
 */
export const sendCreated = <T>(
  res: Response,
  data: T,
  message: string = "Resource created successfully"
): void => {
  sendSuccess(res, data, message, 201);
};

/**
 * Send no content response (204)
 */
export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};

/**
 * Send accepted response (202)
 */
export const sendAccepted = <T>(
  res: Response,
  data?: T,
  message: string = "Request accepted"
): void => {
  sendSuccess(res, data, message, 202);
};

/**
 * Calculate pagination metadata
 */
export const calculatePagination = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

/**
 * Parse pagination parameters from query
 */
export const parsePagination = (
  query: any
): {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
} => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

/**
 * Format date for API responses
 */
export const formatDate = (date: Date): string => {
  return date.toISOString();
};

/**
 * Sanitize user data for API responses (remove sensitive fields)
 */
export const sanitizeUser = (user: any): any => {
  const { password, resetToken, resetTokenExpiry, ...sanitized } = user;
  return sanitized;
};

/**
 * Generate API response helpers
 */
export const ApiResponse = {
  success: sendSuccess,
  created: sendCreated,
  noContent: sendNoContent,
  accepted: sendAccepted,
  paginated: sendPaginated,
} as const;
