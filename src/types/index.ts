import { Request } from "express";
import { UserRole } from "@prisma/client";

/**
 * Extended Express Request interface with user data
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    permissions: string[];
    sessionId: string;
  };
}

/**
 * API Response interfaces
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    pagination?: PaginationMeta;
    [key: string]: any;
  };
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Survey related types
 */
export interface SurveySubmission {
  deviceId: string;
  location: string;
  answer: "EXCELLENT" | "GOOD" | "POOR";
  timestamp: Date;
  deviceInfo: DeviceInfo;
}

export interface DeviceInfo {
  model: string;
  os: string;
  version: string;
  appVersion: string;
}

export interface SurveyFilters {
  location?: string;
  answer?: "EXCELLENT" | "GOOD" | "POOR";
  startDate?: Date;
  endDate?: Date;
  deviceId?: string;
}

export interface SurveyStats {
  total: number;
  excellent: number;
  good: number;
  poor: number;
  percentages: {
    excellent: number;
    good: number;
    poor: number;
  };
  byLocation: LocationStats[];
  byDate: DateStats[];
}

export interface LocationStats {
  location: string;
  total: number;
  excellent: number;
  good: number;
  poor: number;
  percentages: {
    excellent: number;
    good: number;
    poor: number;
  };
}

export interface DateStats {
  date: string;
  total: number;
  excellent: number;
  good: number;
  poor: number;
}

/**
 * Device related types
 */
export interface DeviceConfiguration {
  surveyInterval: number;
  theme: string;
  language: string;
}

export interface DeviceRegistration {
  deviceId: string;
  location: string;
  name: string;
  configuration?: DeviceConfiguration;
}

/**
 * Authentication related types
 */
export interface LoginCredentials {
  email: string;
  password: string;
  deviceInfo?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface LoginResult {
  user: any;
  tokens: TokenPair;
  session: {
    id: string;
    expiresAt: Date;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: string[];
  organization?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Error types
 */
export interface AppErrorType {
  message: string;
  statusCode: number;
  code?: string;
  details?: any;
  isOperational: boolean;
}

/**
 * Environment configuration types
 */
export interface DatabaseConfig {
  url: string;
}

export interface JWTConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface RedisConfig {
  url: string;
  password: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: {
    email: string;
    name: string;
  };
}

export interface SecurityConfig {
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockTime: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

/**
 * Service method return types
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface BulkOperation {
  successCount: number;
  failureCount: number;
  errors?: string[];
}

/**
 * Audit log types
 */
export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Analytics types
 */
export interface AnalyticsData {
  period: "day" | "week" | "month";
  dateRange: {
    start: Date;
    end: Date;
  };
  stats: SurveyStats;
  trend: Array<{
    timestamp: Date;
    count: number;
  }>;
  topLocations: Array<{
    location: string;
    count: number;
  }>;
}

/**
 * Export types
 */
export type ExportFormat = "csv" | "json";

export interface ExportOptions {
  format: ExportFormat;
  filters?: SurveyFilters;
  maxRecords?: number;
}

/**
 * Session types
 */
export interface SessionData {
  userId: string;
  sessionToken: string;
  refreshToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

/**
 * Utility types
 */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type Partial<T> = { [P in keyof T]?: T[P] };
export type Required<T> = { [P in keyof T]-?: T[P] };

/**
 * Database query types
 */
export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, any>;
}

export interface CountResult {
  count: number;
}

/**
 * HTTP status codes
 */
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  HTTP = "http",
  DEBUG = "debug",
}
