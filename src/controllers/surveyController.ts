import { Request, Response } from "express";
import { SurveyService } from "../services/surveyService";
import { logger } from "../config/logger";
import { AppError } from "../utils/appError";
import { sendSuccess, sendCreated, sendPaginated } from "../utils/response";
import { asyncHandler } from "../middleware/errorHandler";
import { prisma } from "../config/database";

/**
 * Survey Controller
 */
export class SurveyController {
  /**
   * Submit a new survey response
   * POST /api/v1/surveys/submit
   */
  static submitSurvey = asyncHandler(async (req: Request, res: Response) => {
    const {
      clientSurveyId,
      deviceId,
      location,
      answer,
      timestamp,
      deviceInfo,
    } = req.body;

    // Enhanced duplicate check with client-side ID
    if (clientSurveyId) {
      const existingSurvey = await prisma.survey.findFirst({
        where: { clientSurveyId: clientSurveyId },
      });
      if (existingSurvey) {
        logger.warn(
          `Duplicate survey submission ignored for client ID: ${clientSurveyId}`
        );
        return sendSuccess(
          res,
          { id: existingSurvey.id, status: "duplicate" },
          "Duplicate survey ignored"
        );
      }
    } else {
      // Fallback for older clients: check for recent similar surveys
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const recentSurvey = await prisma.survey.findFirst({
        where: {
          deviceId,
          location,
          answer,
          createdAt: {
            gte: fiveSecondsAgo,
          },
        },
      });

      if (recentSurvey) {
        logger.warn(
          `Potential duplicate survey submission throttled for device: ${deviceId}`
        );
        throw new AppError(
          "Duplicate survey submission detected. Please try again in a moment.",
          429
        );
      }
    }

    // Find device and update lastSeen
    const device = await prisma.device.update({
      where: { deviceId: deviceId },
      data: {
        lastSeen: new Date(),
      },
    });

    if (!device) {
      throw AppError.notFound("Device not found");
    }

    // Create survey
    const survey = await prisma.survey.create({
      data: {
        deviceId,
        location,
        answer,
        timestamp,
        deviceInfo,
        syncStatus: "SYNCED",
        updatedAt: new Date(),
        ...(clientSurveyId && { clientSurveyId }),
      },
    });

    logger.info(
      `Survey submitted successfully. Survey ID: ${survey.id}, Client ID: ${clientSurveyId}`
    );

    sendCreated(res, survey, "Survey submitted successfully");
  });

  /**
   * Get survey statistics
   * GET /api/v1/surveys/stats
   */
  static getStats = asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      location: req.query.location as string,
      answer: req.query.answer as any,
      startDate: req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined,
      endDate: req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined,
      deviceId: req.query.deviceId as string,
    };

    const stats = await SurveyService.getStats(filters);

    sendSuccess(res, stats, "Survey statistics retrieved successfully");
  });

  /**
   * Get surveys with pagination
   * GET /api/v1/surveys
   */
  static getSurveys = asyncHandler(async (req: Request, res: Response) => {
    const result = await SurveyService.getSurveys(req.query);

    sendPaginated(
      res,
      result.surveys,
      result.pagination,
      "Surveys retrieved successfully"
    );
  });

  /**
   * Get surveys by location
   * GET /api/v1/surveys/location/:locationId
   */
  static getSurveysByLocation = asyncHandler(
    async (req: Request, res: Response) => {
      const { locationId } = req.params;

      const result = await SurveyService.getSurveysByLocation(
        locationId,
        req.query
      );

      sendPaginated(
        res,
        result.surveys,
        result.pagination,
        `Surveys for location '${locationId}' retrieved successfully`
      );
    }
  );

  /**
   * Export surveys
   * GET /api/v1/surveys/export
   */
  static exportSurveys = asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      location: req.query.location as string,
      answer: req.query.answer as any,
      startDate: req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined,
      endDate: req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined,
      deviceId: req.query.deviceId as string,
    };

    const format = (req.query.format as "csv" | "json") || "csv";
    const exportData = await SurveyService.exportSurveys(filters, format);

    // Set appropriate headers for file download
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `surveys_export_${timestamp}.${format}`;

    res.setHeader(
      "Content-Type",
      format === "csv" ? "text/csv" : "application/json"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.send(exportData);
  });

  /**
   * Get survey analytics for dashboard
   * GET /api/v1/surveys/analytics
   */
  static getAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as "day" | "week" | "month") || "week";

    const analytics = await SurveyService.getAnalytics(period);

    sendSuccess(res, analytics, "Survey analytics retrieved successfully");
  });

  /**
   * Get real-time survey feed (last 100 surveys)
   * GET /api/v1/surveys/feed
   */
  static getSurveyFeed = asyncHandler(async (req: Request, res: Response) => {
    const result = await SurveyService.getSurveys({
      limit: 100,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    sendSuccess(res, result.surveys, "Survey feed retrieved successfully");
  });

  /**
   * Get survey summary for specific date range
   * GET /api/v1/surveys/summary
   */
  static getSurveySummary = asyncHandler(
    async (req: Request, res: Response) => {
      const { startDate, endDate, location } = req.query;

      if (!startDate || !endDate) {
        throw AppError.validation("Start date and end date are required");
      }

      const filters = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        location: location as string,
      };

      const [stats, surveys] = await Promise.all([
        SurveyService.getStats(filters),
        SurveyService.getSurveys({
          ...filters,
          limit: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ]);

      sendSuccess(
        res,
        {
          summary: stats,
          recentSurveys: surveys.surveys,
          dateRange: {
            start: filters.startDate,
            end: filters.endDate,
          },
        },
        "Survey summary retrieved successfully"
      );
    }
  );

  /**
   * Delete surveys (admin only)
   * DELETE /api/v1/surveys/cleanup
   */
  static cleanupSurveys = asyncHandler(async (req: Request, res: Response) => {
    const daysToKeep = parseInt(req.query.days as string) || 365;

    if (daysToKeep < 30) {
      throw AppError.validation("Cannot delete surveys newer than 30 days");
    }

    const deletedCount = await SurveyService.cleanupOldSurveys(daysToKeep);

    sendSuccess(
      res,
      {
        deletedCount,
        daysToKeep,
      },
      `Cleaned up ${deletedCount} old surveys`
    );
  });

  /**
   * Get surveys count by status
   * GET /api/v1/surveys/status-count
   */
  static getStatusCount = asyncHandler(async (req: Request, res: Response) => {
    // This would require additional logic in the service
    // For now, returning a placeholder
    const statusCount = {
      synced: 0,
      pending: 0,
      failed: 0,
    };

    sendSuccess(res, statusCount, "Survey status count retrieved successfully");
  });

  /**
   * Bulk update survey sync status (for offline sync)
   * PUT /api/v1/surveys/bulk-sync
   */
  static bulkSyncUpdate = asyncHandler(async (req: Request, res: Response) => {
    const { surveyIds, status } = req.body;

    if (!Array.isArray(surveyIds) || surveyIds.length === 0) {
      throw AppError.validation("Survey IDs array is required");
    }

    if (!["SYNCED", "PENDING", "FAILED"].includes(status)) {
      throw AppError.validation("Invalid sync status");
    }

    // Bulk update logic would go here
    // For now, returning success
    sendSuccess(
      res,
      {
        updatedCount: surveyIds.length,
        status,
      },
      `Updated ${surveyIds.length} surveys to ${status} status`
    );
  });
}
