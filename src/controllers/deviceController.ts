import { Request, Response } from "express";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { AppError } from "../utils/appError";
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent,
} from "../utils/response";
import { asyncHandler } from "../middleware/errorHandler";
import { parsePagination, calculatePagination } from "../utils/response";

/**
 * Device Controller
 */
export class DeviceController {
  /**
   * Register a new device
   * POST /api/v1/devices/register
   */
  static registerDevice = asyncHandler(async (req: Request, res: Response) => {
    const { deviceId, location, name, configuration } = req.body;

    // Check if device already exists
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId },
    });

    if (existingDevice) {
      throw AppError.conflict("Device already registered");
    }

    // Create new device
    const device = await prisma.device.create({
      data: {
        deviceId,
        location,
        name,
        configuration: configuration || {
          surveyInterval: 30,
          theme: "default",
          language: "en",
        },
        lastSeen: new Date(),
      },
    });

    logger.info(`Device registered: ${deviceId} at ${location}`);

    sendCreated(res, device, "Device registered successfully");
  });

  /**
   * Update device information
   * PUT /api/v1/devices/:id
   */
  static updateDevice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, location, status, configuration } = req.body;

    // Check if device exists
    const existingDevice = await prisma.device.findUnique({
      where: { id },
    });

    if (!existingDevice) {
      throw AppError.notFound("Device");
    }

    // Update device
    const device = await prisma.device.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(location && { location }),
        ...(status && { status }),
        ...(configuration && { configuration }),
        updatedAt: new Date(),
      },
    });

    logger.info(`Device updated: ${device.deviceId}`);

    sendSuccess(res, device, "Device updated successfully");
  });

  /**
   * Get all devices with pagination
   * GET /api/v1/devices
   */
  static getDevices = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(req.query);

    // Build where clause for filtering
    const whereClause: any = {};

    if (req.query.location) {
      whereClause.location = {
        contains: req.query.location as string,
        mode: "insensitive",
      };
    }

    if (req.query.status) {
      whereClause.status = req.query.status as string;
    }

    // Get total count
    const total = await prisma.device.count({
      where: whereClause,
    });

    // Get devices
    const devices = await prisma.device.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
      include: {
        _count: {
          select: {
            surveys: true,
          },
        },
      },
    });

    const pagination = calculatePagination(page, limit, total);

    sendPaginated(res, devices, pagination, "Devices retrieved successfully");
  });

  /**
   * Get device by ID
   * GET /api/v1/devices/:id
   */
  static getDevice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            surveys: true,
          },
        },
        surveys: {
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
      },
    });

    if (!device) {
      throw AppError.notFound("Device");
    }

    sendSuccess(res, device, "Device retrieved successfully");
  });

  /**
   * Delete device
   * DELETE /api/v1/devices/:id
   */
  static deleteDevice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if device exists
    const existingDevice = await prisma.device.findUnique({
      where: { id },
    });

    if (!existingDevice) {
      throw AppError.notFound("Device");
    }

    // Delete device (this will also delete related surveys due to cascade)
    await prisma.device.delete({
      where: { id },
    });

    logger.info(`Device deleted: ${existingDevice.deviceId}`);

    sendNoContent(res);
  });

  /**
   * Get device configuration
   * GET /api/v1/devices/:id/config
   */
  static getDeviceConfig = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const device = await prisma.device.findUnique({
      where: { id },
      select: {
        deviceId: true,
        configuration: true,
        updatedAt: true,
      },
    });

    if (!device) {
      throw AppError.notFound("Device");
    }

    sendSuccess(res, device, "Device configuration retrieved successfully");
  });

  /**
   * Update device configuration
   * PUT /api/v1/devices/:id/config
   */
  static updateDeviceConfig = asyncHandler(
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const { configuration } = req.body;

      // Check if device exists
      const existingDevice = await prisma.device.findUnique({
        where: { id },
      });

      if (!existingDevice) {
        throw AppError.notFound("Device");
      }

      // Update configuration
      const device = await prisma.device.update({
        where: { id },
        data: {
          configuration: {
            ...existingDevice.configuration,
            ...configuration,
          },
          updatedAt: new Date(),
        },
      });

      logger.info(`Device configuration updated: ${device.deviceId}`);

      sendSuccess(
        res,
        device.configuration,
        "Device configuration updated successfully"
      );
    }
  );

  /**
   * Get device status
   * GET /api/v1/devices/:id/status
   */
  static getDeviceStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const device = await prisma.device.findUnique({
      where: { id },
      select: {
        deviceId: true,
        status: true,
        lastSeen: true,
        location: true,
        _count: {
          select: {
            surveys: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                },
              },
            },
          },
        },
      },
    });

    if (!device) {
      throw AppError.notFound("Device");
    }

    // Calculate online status (if last seen within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isOnline = device.lastSeen && device.lastSeen > fiveMinutesAgo;

    const status = {
      deviceId: device.deviceId,
      status: device.status,
      isOnline,
      lastSeen: device.lastSeen,
      location: device.location,
      surveysToday: device._count.surveys,
    };

    sendSuccess(res, status, "Device status retrieved successfully");
  });

  /**
   * Ping device to update last seen timestamp
   * POST /api/v1/devices/:id/ping
   */
  static pingDevice = asyncHandler(async (req: Request, res: Response) => {
    const { deviceId } = req.params;

    const device = await prisma.device.findUnique({
      where: { deviceId },
    });

    if (!device) {
      throw AppError.notFound("Device");
    }

    // Update lastSeen
    const updatedDevice = await prisma.device.update({
      where: { deviceId },
      data: {
        lastSeen: new Date(),
      },
    });

    sendSuccess(
      res,
      { lastSeen: updatedDevice.lastSeen },
      "Device pinged successfully"
    );
  });

  /**
   * Get device statistics
   * GET /api/v1/devices/stats
   */
  static getDeviceStats = asyncHandler(async (_req: Request, res: Response) => {
    const [
      totalDevices,
      activeDevices,
      inactiveDevices,
      maintenanceDevices,
      onlineDevices,
    ] = await Promise.all([
      prisma.device.count(),
      prisma.device.count({ where: { status: "ACTIVE" } }),
      prisma.device.count({ where: { status: "INACTIVE" } }),
      prisma.device.count({ where: { status: "MAINTENANCE" } }),
      prisma.device.count({
        where: {
          lastSeen: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
          },
        },
      }),
    ]);

    const stats = {
      total: totalDevices,
      active: activeDevices,
      inactive: inactiveDevices,
      maintenance: maintenanceDevices,
      online: onlineDevices,
      offline: totalDevices - onlineDevices,
    };

    sendSuccess(res, stats, "Device statistics retrieved successfully");
  });

  /**
   * Get devices by location
   * GET /api/v1/devices/location/:location
   */
  static getDevicesByLocation = asyncHandler(
    async (req: Request, res: Response) => {
      const { location } = req.params;
      const { page, limit, skip, sortBy, sortOrder } = parsePagination(
        req.query
      );

      const whereClause = {
        location: {
          contains: location,
          mode: "insensitive" as const,
        },
      };

      // Get total count
      const total = await prisma.device.count({
        where: whereClause,
      });

      // Get devices
      const devices = await prisma.device.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: {
              surveys: true,
            },
          },
        },
      });

      const pagination = calculatePagination(page, limit, total);

      sendPaginated(
        res,
        devices,
        pagination,
        `Devices for location '${location}' retrieved successfully`
      );
    }
  );

  /**
   * Bulk update device status
   * PUT /api/v1/devices/bulk-status
   */
  static bulkUpdateStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const { deviceIds, status } = req.body;

      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        throw AppError.validation("Device IDs array is required");
      }

      if (!["ACTIVE", "INACTIVE", "MAINTENANCE"].includes(status)) {
        throw AppError.validation("Invalid device status");
      }

      const result = await prisma.device.updateMany({
        where: {
          id: {
            in: deviceIds,
          },
        },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      logger.info(`Bulk updated ${result.count} devices to ${status} status`);

      sendSuccess(
        res,
        {
          updatedCount: result.count,
          status,
        },
        `Updated ${result.count} devices to ${status} status`
      );
    }
  );
}
