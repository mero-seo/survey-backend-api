import { Router } from "express";
import { SurveyController } from "../controllers/surveyController";
import { validate, surveySchemas } from "../middleware/validation";
import {
  authenticate,
  authorize,
  authenticateDevice,
} from "../middleware/auth";
import { UserRole } from "@prisma/client";

const router = Router();

/**
 * Device routes (device authentication required)
 */
router.post(
  "/submit",
  authenticateDevice,
  validate(surveySchemas.submit),
  SurveyController.submitSurvey
);

/**
 * Public/Read-only routes (optional authentication)
 */
router.get("/stats", validate(surveySchemas.stats), SurveyController.getStats);

router.get("/filter-options", authenticate, SurveyController.getFilterOptions);

router.get("/analytics", authenticate, SurveyController.getAnalytics);

router.get(
  "/shift-analytics",
  authenticate,
  SurveyController.getShiftAnalytics
);

router.get("/feed", authenticate, SurveyController.getSurveyFeed);

/**
 * Protected routes (authentication required)
 */
router.use(authenticate); // All routes below require authentication

router.get(
  "/",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  validate(surveySchemas.stats),
  SurveyController.getSurveys
);

router.get(
  "/location/:locationId",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  validate(surveySchemas.byLocation),
  SurveyController.getSurveysByLocation
);

router.get(
  "/summary",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VIEWER]),
  SurveyController.getSurveySummary
);

router.get(
  "/status-count",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  SurveyController.getStatusCount
);

/**
 * Export routes (admin and above)
 */
router.get(
  "/export",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(surveySchemas.export),
  SurveyController.exportSurveys
);

/**
 * Admin-only routes
 */
router.delete(
  "/cleanup",
  authorize([UserRole.SUPER_ADMIN]),
  SurveyController.cleanupSurveys
);

router.put(
  "/bulk-sync",
  authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  SurveyController.bulkSyncUpdate
);

export default router;
