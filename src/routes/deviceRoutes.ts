import { Router } from "express";
import { DeviceController } from "../controllers/deviceController";
import { validate, deviceSchemas } from "../middleware/validation";
import { authenticate, authorize } from "../middleware/auth";
import { UserRole } from "@prisma/client";

const router = Router();

/**
 * Device registration (can be public or admin-only based on requirements)
 */
router.post(
  "/register",
  validate(deviceSchemas.register),
  DeviceController.registerDevice
);

/**
 * Device ping (minimal authentication)
 */
router.post("/ping/:deviceId", DeviceController.pingDevice);

/**
 * Public endpoint for getting device locations during setup
 */
router.get("/locations", DeviceController.getDeviceLocations);

/**
 * Public endpoint for getting device status by deviceId
 */
router.get(
  "/status-by-device-id/:deviceId",
  DeviceController.getDeviceStatusByDeviceId
);

/**
 * Protected routes (authentication required)
 */
router.use(authenticate); // All routes below require authentication

/**
 * Viewer and above routes
 */
router.get(
  "/",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  validate(deviceSchemas.list),
  DeviceController.getDevices
);

router.get(
  "/stats",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  DeviceController.getDeviceStats
);

router.get(
  "/location/:location",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  DeviceController.getDevicesByLocation
);

router.get(
  "/:id",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  DeviceController.getDevice
);

router.get(
  "/by-device-id/:deviceId",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  DeviceController.getDeviceByDeviceId
);

router.get(
  "/:id/status",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  DeviceController.getDeviceStatus
);

/**
 * Admin and above routes
 */
router.put(
  "/:id",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(deviceSchemas.update),
  DeviceController.updateDevice
);

router.put(
  "/bulk-status",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  DeviceController.bulkUpdateStatus
);

/**
 * Super admin only routes
 */
router.delete(
  "/:id",
  authorize([UserRole.SUPER_ADMIN]),
  validate(deviceSchemas.delete),
  DeviceController.deleteDevice
);

export default router;
