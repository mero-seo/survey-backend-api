import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { AppError } from "../utils/appError";

/**
 * Validation middleware factory
 */
export const validate = (schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        errors.push(`Body: ${error.message}`);
      }
    }

    // Validate query parameters
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        errors.push(`Query: ${error.message}`);
      }
    }

    // Validate path parameters
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        errors.push(`Params: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(errors.join(", "), 400);
    }

    next();
  };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // MongoDB ObjectId validation
  objectId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message("Invalid ObjectId"),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref("startDate")),
  }),

  // Email
  email: Joi.string().email().lowercase().trim(),

  // Password
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .message(
      "Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character"
    ),

  // Device ID
  deviceId: Joi.string().min(3).max(50).alphanum(),

  // Location
  location: Joi.string().min(2).max(100).trim(),
};

/**
 * Survey validation schemas
 */
export const surveySchemas = {
  submit: {
    body: Joi.object({
      clientSurveyId: Joi.string().optional(),
      deviceId: commonSchemas.deviceId.required(),
      location: commonSchemas.location.required(),
      answer: Joi.string()
        .valid("EXCELLENT", "SATISFACTORY", "AVERAGE")
        .required(),
      timestamp: Joi.date().iso().required(),
      deviceInfo: Joi.object({
        model: Joi.string().required(),
        os: Joi.string().required(),
        version: Joi.string().required(),
        appVersion: Joi.string().required(),
      }).required(),
    }),
  },

  stats: {
    query: commonSchemas.pagination.keys({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso().min(Joi.ref("startDate")),
      location: commonSchemas.location.optional(),
      answer: Joi.string()
        .valid("EXCELLENT", "SATISFACTORY", "AVERAGE")
        .optional(),
      timeShift: Joi.string().valid("morning", "day", "night").optional(),
      deviceName: Joi.string().min(1).max(100).optional(),
      syncStatus: Joi.string().valid("SYNCED", "PENDING", "FAILED").optional(),
      search: Joi.string().min(1).max(200).optional(),
    }),
  },

  export: {
    query: commonSchemas.dateRange.keys({
      location: commonSchemas.location.optional(),
      format: Joi.string().valid("csv", "json").default("csv"),
    }),
  },

  byLocation: {
    params: Joi.object({
      locationId: Joi.string().required(),
    }),
    query: commonSchemas.pagination,
  },
};

/**
 * Device validation schemas
 */
export const deviceSchemas = {
  register: {
    body: Joi.object({
      deviceId: commonSchemas.deviceId.required(),
      location: commonSchemas.location.required(),
      name: Joi.string().min(2).max(100).required(),
      configuration: Joi.object({
        surveyInterval: Joi.number().integer().min(10).max(300).default(30),
        theme: Joi.string()
          .valid("default", "light", "dark")
          .default("default"),
        language: Joi.string().valid("en", "ne").default("en"),
      }).default({}),
    }),
  },

  update: {
    params: Joi.object({
      id: commonSchemas.objectId.required(),
    }),
    body: Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      location: commonSchemas.location.optional(),
      status: Joi.string()
        .valid("ACTIVE", "INACTIVE", "MAINTENANCE")
        .optional(),
      configuration: Joi.object({
        surveyInterval: Joi.number().integer().min(10).max(300).optional(),
        theme: Joi.string().valid("default", "light", "dark").optional(),
        language: Joi.string().valid("en", "ne").optional(),
      }).optional(),
    }),
  },

  list: {
    query: commonSchemas.pagination.keys({
      location: commonSchemas.location.optional(),
      status: Joi.string()
        .valid("ACTIVE", "INACTIVE", "MAINTENANCE")
        .optional(),
    }),
  },

  delete: {
    params: Joi.object({
      id: commonSchemas.objectId.required(),
    }),
  },
};

/**
 * Auth validation schemas
 */
export const authSchemas = {
  login: {
    body: Joi.object({
      email: commonSchemas.email.required(),
      password: Joi.string().required(),
      deviceInfo: Joi.string().optional(),
    }),
  },

  register: {
    body: Joi.object({
      email: commonSchemas.email.required(),
      name: Joi.string().min(2).max(100).required(),
      password: commonSchemas.password.required(),
      confirmPassword: Joi.string()
        .valid(Joi.ref("password"))
        .required()
        .messages({ "any.only": "Passwords do not match" }),
      role: Joi.string().valid("ADMIN", "VIEWER").default("VIEWER"),
      organization: Joi.string().max(100).optional(),
    }),
  },

  refreshToken: {
    body: Joi.object({
      refreshToken: Joi.string().required(),
    }),
  },

  forgotPassword: {
    body: Joi.object({
      email: commonSchemas.email.required(),
    }),
  },

  resetPassword: {
    body: Joi.object({
      token: Joi.string().required(),
      password: commonSchemas.password.required(),
      confirmPassword: Joi.string()
        .valid(Joi.ref("password"))
        .required()
        .messages({ "any.only": "Passwords do not match" }),
    }),
  },

  changePassword: {
    body: Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: commonSchemas.password.required(),
      confirmPassword: Joi.string()
        .valid(Joi.ref("newPassword"))
        .required()
        .messages({ "any.only": "Passwords do not match" }),
    }),
  },
};
