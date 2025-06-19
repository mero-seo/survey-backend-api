import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/config/database";
import { config } from "@/config/env";
import { logger } from "@/config/logger";
import { AppError } from "@/utils/appError";
import { sanitizeUser } from "@/utils/response";

/**
 * Token pair interface
 */
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Login result interface
 */
interface LoginResult {
  user: any;
  tokens: TokenPair;
  session: any;
}

/**
 * Authentication Service
 */
export class AuthService {
  /**
   * Login user with email and password
   */
  static async login(
    email: string,
    password: string,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    try {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.isActive) {
        throw AppError.unauthorized("Invalid credentials");
      }

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > new Date()) {
        const lockTimeRemaining = Math.ceil(
          (user.lockUntil.getTime() - Date.now()) / 1000 / 60
        );
        throw AppError.unauthorized(
          `Account is locked. Try again in ${lockTimeRemaining} minutes.`
        );
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.handleFailedLogin(user.id);
        throw AppError.unauthorized("Invalid credentials");
      }

      // Reset login attempts on successful login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
          lockUntil: null,
          lastLogin: new Date(),
        },
      });

      // Create session
      const session = await this.createSession(
        user.id,
        deviceInfo,
        ipAddress,
        userAgent
      );

      // Generate tokens
      const tokens = await this.generateTokens(user.id, session.id);

      logger.info(`User logged in successfully: ${user.email}`);

      return {
        user: sanitizeUser(user),
        tokens,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
        },
      };
    } catch (error) {
      logger.error("Login error", { email, error });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      // Find active session
      const session = await prisma.session.findFirst({
        where: {
          id: decoded.sessionId,
          refreshToken,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

      if (!session || !session.user.isActive) {
        throw AppError.unauthorized("Invalid refresh token");
      }

      // Generate new token pair
      const tokens = await this.generateTokens(session.userId, session.id);

      // Update session with new refresh token
      await prisma.session.update({
        where: { id: session.id },
        data: {
          refreshToken: tokens.refreshToken,
          updatedAt: new Date(),
        },
      });

      logger.info(`Token refreshed for user: ${session.user.email}`);

      return tokens;
    } catch (error) {
      logger.error("Token refresh error", { error });

      if (error instanceof jwt.JsonWebTokenError) {
        throw AppError.unauthorized("Invalid refresh token");
      }

      throw error;
    }
  }

  /**
   * Logout user by invalidating session
   */
  static async logout(sessionId: string): Promise<void> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      logger.info(`User logged out, session: ${sessionId}`);
    } catch (error) {
      logger.error("Logout error", { sessionId, error });
      throw error;
    }
  }

  /**
   * Logout user from all devices
   */
  static async logoutAll(userId: string): Promise<void> {
    try {
      await prisma.session.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      logger.info(`User logged out from all devices: ${userId}`);
    } catch (error) {
      logger.error("Logout all error", { userId, error });
      throw error;
    }
  }

  /**
   * Get current user by session
   */
  static async getCurrentUser(sessionId: string): Promise<any> {
    try {
      const session = await prisma.session.findFirst({
        where: {
          id: sessionId,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

      if (!session || !session.user.isActive) {
        throw AppError.unauthorized("Invalid session");
      }

      return sanitizeUser(session.user);
    } catch (error) {
      logger.error("Get current user error", { sessionId, error });
      throw error;
    }
  }

  /**
   * Generate forgot password token
   */
  static async generatePasswordResetToken(email: string): Promise<string> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.isActive) {
        // Don't reveal if user exists or not
        return "reset-token-sent";
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });

      logger.info(`Password reset token generated for user: ${user.email}`);

      return resetToken;
    } catch (error) {
      logger.error("Generate password reset token error", { email, error });
      throw error;
    }
  }

  /**
   * Reset password using token
   */
  static async resetPassword(
    token: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: {
            gt: new Date(),
          },
          isActive: true,
        },
      });

      if (!user) {
        throw AppError.unauthorized("Invalid or expired reset token");
      }

      const hashedPassword = await bcrypt.hash(
        newPassword,
        config.security.bcryptRounds
      );

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
          loginAttempts: 0,
          lockUntil: null,
        },
      });

      // Invalidate all sessions
      await this.logoutAll(user.id);

      logger.info(`Password reset successful for user: ${user.email}`);
    } catch (error) {
      logger.error("Reset password error", { error });
      throw error;
    }
  }

  /**
   * Change password for authenticated user
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.isActive) {
        throw AppError.notFound("User");
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );

      if (!isCurrentPasswordValid) {
        throw AppError.unauthorized("Current password is incorrect");
      }

      const hashedNewPassword = await bcrypt.hash(
        newPassword,
        config.security.bcryptRounds
      );

      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
        },
      });

      logger.info(`Password changed for user: ${user.email}`);
    } catch (error) {
      logger.error("Change password error", { userId, error });
      throw error;
    }
  }

  /**
   * Generate JWT token pair
   */
  private static async generateTokens(
    userId: string,
    sessionId: string
  ): Promise<TokenPair> {
    const accessToken = jwt.sign({ userId, sessionId }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(
      { userId, sessionId },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
    };
  }

  /**
   * Create user session
   */
  private static async createSession(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
    const sessionToken = crypto.randomUUID();
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    );

    return await prisma.session.create({
      data: {
        userId,
        sessionToken,
        refreshToken,
        deviceInfo: deviceInfo || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      },
    });
  }

  /**
   * Handle failed login attempt
   */
  private static async handleFailedLogin(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return;

    const newLoginAttempts = user.loginAttempts + 1;
    const updateData: any = {
      loginAttempts: newLoginAttempts,
    };

    // Lock account after max attempts
    if (newLoginAttempts >= config.security.maxLoginAttempts) {
      updateData.lockUntil = new Date(Date.now() + config.security.lockTime);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { isActive: false }],
        },
      });

      logger.info(`Cleaned up ${result.count} expired sessions`);
    } catch (error) {
      logger.error("Session cleanup error", { error });
    }
  }
}
