import { Request, Response } from "express";
import { AuthService } from "../services/authService";
import { logger } from "../config/logger";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../middleware/errorHandler";

/**
 * Authentication Controller
 */
export class AuthController {
  /**
   * Login user
   * POST /api/v1/auth/login
   */
  static login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, deviceInfo } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get("User-Agent");

    const result = await AuthService.login(
      email,
      password,
      deviceInfo,
      ipAddress,
      userAgent
    );

    if (!result) {
      throw AppError.unauthorized("Invalid email or password.");
    }

    // Set secure HTTP-only cookie for refresh token
    res.cookie("refreshToken", result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    sendSuccess(
      res,
      {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
        session: result.session,
      },
      "Login successful"
    );
  });

  /**
   * Refresh access token
   * POST /api/v1/auth/refresh
   */
  static refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshToken) {
      throw AppError.unauthorized("Refresh token is required");
    }

    const tokens = await AuthService.refreshToken(refreshToken);

    // Update refresh token cookie
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    sendSuccess(
      res,
      {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      },
      "Token refreshed successfully"
    );
  });

  /**
   * Logout user
   * POST /api/v1/auth/logout
   */
  static logout = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.user?.sessionId;

    if (sessionId) {
      await AuthService.logout(sessionId);
    }

    // Clear refresh token cookie
    res.clearCookie("refreshToken");

    sendSuccess(res, null, "Logout successful");
  });

  /**
   * Logout from all devices
   * POST /api/v1/auth/logout-all
   */
  static logoutAll = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw AppError.unauthorized("User not authenticated");
    }

    await AuthService.logoutAll(userId);

    // Clear refresh token cookie
    res.clearCookie("refreshToken");

    sendSuccess(res, null, "Logged out from all devices");
  });

  /**
   * Get current user profile
   * GET /api/v1/auth/me
   */
  static getProfile = asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.user?.sessionId;

    if (!sessionId) {
      throw AppError.unauthorized("Session not found");
    }

    const user = await AuthService.getCurrentUser(sessionId);

    sendSuccess(res, user, "Profile retrieved successfully");
  });

  /**
   * Update user profile
   * PUT /api/v1/auth/profile
   */
  static updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { name, organization } = req.body;

    if (!userId) {
      throw AppError.unauthorized("User not authenticated");
    }

    // Update user profile logic would go here
    // For now, we'll just return success
    sendSuccess(res, { name, organization }, "Profile updated successfully");
  });

  /**
   * Verify token (for middleware testing)
   * GET /api/v1/auth/verify
   */
  static verifyToken = asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(
      res,
      {
        user: req.user,
        valid: true,
      },
      "Token is valid"
    );
  });
}
