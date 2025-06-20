import Joi from "joi";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3001),
  API_VERSION: Joi.string().default("v1"),

  // Database
  DATABASE_URL: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default("24h"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),

  // Redis
  REDIS_URL: Joi.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: Joi.string().allow("").default(""),

  // Email
  SMTP_HOST: Joi.string().default("smtp.gmail.com"),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow("").default(""),
  SMTP_PASS: Joi.string().allow("").default(""),
  FROM_EMAIL: Joi.string().email().default("noreply@surveyapp.com"),
  FROM_NAME: Joi.string().default("Survey App"),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // File Upload
  MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB
  UPLOAD_PATH: Joi.string().default("./uploads"),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "http", "debug")
    .default("info"),
  SENTRY_DSN: Joi.string().allow("").default(""),

  // Admin
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),

  // Security
  BCRYPT_ROUNDS: Joi.number().default(12),
  MAX_LOGIN_ATTEMPTS: Joi.number().default(5),
  LOCK_TIME: Joi.number().default(3600000), // 1 hour

  // Export
  EXPORT_MAX_RECORDS: Joi.number().default(50000),
  EXPORT_TEMP_DIR: Joi.string().default("./temp"),
}).unknown();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Export configuration
export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  apiVersion: envVars.API_VERSION,

  database: {
    url: envVars.DATABASE_URL,
  },

  jwt: {
    secret: envVars.JWT_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },

  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD,
  },

  email: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    user: envVars.SMTP_USER,
    pass: envVars.SMTP_PASS,
    from: {
      email: envVars.FROM_EMAIL,
      name: envVars.FROM_NAME,
    },
  },

  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    max: envVars.RATE_LIMIT_MAX_REQUESTS,
  },

  upload: {
    maxSize: envVars.MAX_FILE_SIZE,
    path: envVars.UPLOAD_PATH,
  },

  logging: {
    level: envVars.LOG_LEVEL,
    sentryDsn: envVars.SENTRY_DSN,
  },

  admin: {
    email: envVars.ADMIN_EMAIL,
    password: envVars.ADMIN_PASSWORD,
  },

  security: {
    bcryptRounds: envVars.BCRYPT_ROUNDS,
    maxLoginAttempts: envVars.MAX_LOGIN_ATTEMPTS,
    lockTime: envVars.LOCK_TIME,
  },

  export: {
    maxRecords: envVars.EXPORT_MAX_RECORDS,
    tempDir: envVars.EXPORT_TEMP_DIR,
  },
};

export default config;
