import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { config } from "../config/env";
import { AppError } from "../utils/appError";
import { UserRole } from "@prisma/client";

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        permissions: string[];
        sessionId: string;
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Authentication token is required", 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new AppError("Authentication token is required", 401);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Check if session exists and is active
    const session = await prisma.session.findFirst({
      where: {
        id: decoded.sessionId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            permissions: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || !session.user || !session.user.isActive) {
      throw new AppError("Invalid or expired session", 401);
    }

    // Update session last activity
    await prisma.session.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    // Attach user to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      permissions: session.user.permissions,
      sessionId: session.id,
    };

    logger.info(`User authenticated: ${session.user.email}`);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn("Invalid JWT token", { error: error.message });
      next(new AppError("Invalid authentication token", 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn("Expired JWT token", { error: error.message });
      next(new AppError("Authentication token has expired", 401));
    } else {
      logger.error("Authentication error", { error });
      next(error);
    }
  }
};

/**
 * Device authentication middleware - for device-specific endpoints
 */
export const authenticateDevice = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { deviceId, location } = req.body;

    if (!deviceId || !location) {
      throw new AppError("Device ID and location are required", 400);
    }

    // Verify device exists and is active
    const device = await prisma.device.findFirst({
      where: {
        deviceId,
        location,
        status: "ACTIVE",
      },
    });

    if (!device) {
      throw new AppError("Device not found or inactive", 404);
    }

    // Update device last seen
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date() },
    });

    logger.info(`Device authenticated: ${deviceId} at ${location}`);
    next();
  } catch (error) {
    logger.error("Device authentication error", { error });
    next(error);
  }
};

/**
 * Authorization middleware - checks user roles and permissions
 */
export const authorize = (
  roles: UserRole[] = [],
  permissions: string[] = []
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401);
      }

      const { role, permissions: userPermissions } = req.user;

      // Check role-based access
      if (roles.length > 0 && !roles.includes(role)) {
        logger.warn(`Access denied for role: ${role}`, {
          userId: req.user.id,
          requiredRoles: roles,
        });
        throw new AppError("Insufficient permissions", 403);
      }

      // Check permission-based access
      if (permissions.length > 0) {
        const hasPermission = permissions.some((permission) =>
          userPermissions.includes(permission)
        );

        if (!hasPermission) {
          logger.warn(
            `Access denied for permissions: ${permissions.join(", ")}`,
            {
              userId: req.user.id,
              userPermissions,
            }
          );
          throw new AppError("Insufficient permissions", 403);
        }
      }

      logger.debug(`Access granted for user: ${req.user.email}`, {
        role,
        requiredRoles: roles,
        requiredPermissions: permissions,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    // Use the main authenticate middleware
    await authenticate(req, res, next);
  } catch (error) {
    // For optional auth, we continue even if authentication fails
    logger.debug("Optional authentication failed, continuing without user", {
      error,
    });
    next();
  }
};
