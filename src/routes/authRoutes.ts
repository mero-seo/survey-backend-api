import { Router } from "express";
import { AuthController } from "@/controllers/authController";
import { validate, authSchemas } from "@/middleware/validation";
import { authenticate, authorize } from "@/middleware/auth";
import { UserRole } from "@prisma/client";

const router = Router();

/**
 * Public routes (no authentication required)
 */
router.post("/login", validate(authSchemas.login), AuthController.login);
router.post(
  "/refresh",
  validate(authSchemas.refreshToken),
  AuthController.refreshToken
);
router.post(
  "/forgot-password",
  validate(authSchemas.forgotPassword),
  AuthController.forgotPassword
);
router.post(
  "/reset-password",
  validate(authSchemas.resetPassword),
  AuthController.resetPassword
);

/**
 * Protected routes (authentication required)
 */
router.use(authenticate); // All routes below require authentication

router.post("/logout", AuthController.logout);
router.post("/logout-all", AuthController.logoutAll);
router.get("/me", AuthController.getProfile);
router.put("/profile", AuthController.updateProfile);
router.post(
  "/change-password",
  validate(authSchemas.changePassword),
  AuthController.changePassword
);
router.get("/verify", AuthController.verifyToken);

/**
 * Admin-only routes
 */
router.post(
  "/register",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(authSchemas.register),
  AuthController.login // For now, using login. In a real app, you'd have a separate register controller
);

export default router;
