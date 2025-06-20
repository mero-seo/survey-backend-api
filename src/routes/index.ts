import { Router } from "express";
import authRoutes from "./authRoutes";
import surveyRoutes from "./surveyRoutes";
import deviceRoutes from "./deviceRoutes";
import { config } from "../config/env";

const router = Router();

// API version prefix
const apiVersion = `/api/${config.apiVersion}`;

// Health check endpoint
router.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    environment: config.env,
  });
});

// Mount route modules
router.use(`${apiVersion}/auth`, authRoutes);
router.use(`${apiVersion}/surveys`, surveyRoutes);
router.use(`${apiVersion}/devices`, deviceRoutes);

// API documentation endpoint
router.get(`${apiVersion}/docs`, (_req, res) => {
  res.json({
    title: "Survey Mobile App API",
    version: config.apiVersion,
    description:
      "RESTful API for Survey Mobile App - offline-first survey data collection system",
    endpoints: {
      auth: {
        "POST /auth/login": "Login user",
        "POST /auth/refresh": "Refresh access token",
        "POST /auth/logout": "Logout user",
        "POST /auth/logout-all": "Logout from all devices",
        "GET /auth/me": "Get current user profile",
        "PUT /auth/profile": "Update user profile",
        "POST /auth/forgot-password": "Request password reset",
        "POST /auth/reset-password": "Reset password with token",
        "POST /auth/change-password": "Change password",
        "GET /auth/verify": "Verify token validity",
      },
      surveys: {
        "POST /surveys/submit": "Submit survey response (device auth)",
        "GET /surveys/stats": "Get survey statistics",
        "GET /surveys": "Get surveys with pagination",
        "GET /surveys/location/:locationId": "Get surveys by location",
        "GET /surveys/export": "Export surveys to CSV/JSON",
        "GET /surveys/analytics": "Get survey analytics",
        "GET /surveys/feed": "Get real-time survey feed",
        "GET /surveys/summary": "Get survey summary for date range",
        "DELETE /surveys/cleanup": "Cleanup old surveys (super admin)",
        "PUT /surveys/bulk-sync": "Bulk update sync status",
      },
      devices: {
        "POST /devices/register": "Register new device",
        "GET /devices": "Get devices with pagination",
        "GET /devices/stats": "Get device statistics",
        "GET /devices/:id": "Get device by ID",
        "PUT /devices/:id": "Update device",
        "DELETE /devices/:id": "Delete device (super admin)",
        "GET /devices/:id/config": "Get device configuration",
        "PUT /devices/:id/config": "Update device configuration",
        "GET /devices/:id/status": "Get device status",
        "POST /devices/:id/ping": "Ping device (update last seen)",
        "GET /devices/location/:location": "Get devices by location",
        "PUT /devices/bulk-status": "Bulk update device status",
      },
    },
    authentication: {
      type: "Bearer Token (JWT)",
      header: "Authorization: Bearer <token>",
      roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
    },
    rateLimit: {
      window: "15 minutes",
      max: config.rateLimit.max,
    },
  });
});

// API info endpoint
router.get(`${apiVersion}`, (req, res) => {
  res.json({
    message: "Survey Mobile App API",
    version: config.apiVersion,
    environment: config.env,
    timestamp: new Date().toISOString(),
    documentation: `${req.protocol}://${req.get("host")}${apiVersion}/docs`,
    health: `${req.protocol}://${req.get("host")}/health`,
  });
});

export default router;
