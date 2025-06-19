import { prisma } from "@/config/database";
import { logger } from "@/config/logger";
import { AppError } from "@/utils/appError";
import { calculatePagination, parsePagination } from "@/utils/response";
import { Parser } from "json2csv";
import { SurveyAnswer } from "@prisma/client";

/**
 * Survey submission data interface
 */
interface SurveySubmissionData {
  deviceId: string;
  location: string;
  answer: SurveyAnswer;
  timestamp: Date;
  deviceInfo: {
    model: string;
    os: string;
    version: string;
    appVersion: string;
  };
}

/**
 * Survey statistics interface
 */
interface SurveyStats {
  total: number;
  excellent: number;
  good: number;
  poor: number;
  percentages: {
    excellent: number;
    good: number;
    poor: number;
  };
  byLocation: Array<{
    location: string;
    total: number;
    excellent: number;
    good: number;
    poor: number;
    percentages: {
      excellent: number;
      good: number;
      poor: number;
    };
  }>;
  byDate: Array<{
    date: string;
    total: number;
    excellent: number;
    good: number;
    poor: number;
  }>;
}

/**
 * Survey filters interface
 */
interface SurveyFilters {
  location?: string;
  answer?: SurveyAnswer;
  startDate?: Date;
  endDate?: Date;
  deviceId?: string;
}

/**
 * Survey Service
 */
export class SurveyService {
  /**
   * Submit a new survey response
   */
  static async submitSurvey(data: SurveySubmissionData): Promise<any> {
    try {
      // Verify device exists and is active
      const device = await prisma.device.findFirst({
        where: {
          deviceId: data.deviceId,
          status: "ACTIVE",
        },
      });

      if (!device) {
        throw AppError.notFound("Device not found or inactive");
      }

      // Check for duplicate submissions (within 1 minute)
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentSubmission = await prisma.survey.findFirst({
        where: {
          deviceId: data.deviceId,
          createdAt: {
            gte: oneMinuteAgo,
          },
        },
      });

      if (recentSubmission) {
        logger.warn(
          `Duplicate survey submission blocked for device: ${data.deviceId}`
        );
        throw AppError.conflict("Survey already submitted recently");
      }

      // Create survey record
      const survey = await prisma.survey.create({
        data: {
          deviceId: data.deviceId,
          location: data.location,
          answer: data.answer,
          timestamp: data.timestamp,
          deviceInfo: data.deviceInfo,
          syncStatus: "SYNCED",
        },
      });

      // Update device last seen
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeen: new Date() },
      });

      logger.info(`Survey submitted successfully: ${survey.id}`);

      return survey;
    } catch (error) {
      logger.error("Survey submission error", { data, error });
      throw error;
    }
  }

  /**
   * Get survey statistics
   */
  static async getStats(filters: SurveyFilters = {}): Promise<SurveyStats> {
    try {
      const whereClause = this.buildWhereClause(filters);

      // Get total counts by answer
      const totalCounts = await prisma.survey.groupBy({
        by: ["answer"],
        where: whereClause,
        _count: {
          answer: true,
        },
      });

      // Get counts by location
      const locationCounts = await prisma.survey.groupBy({
        by: ["location", "answer"],
        where: whereClause,
        _count: {
          answer: true,
        },
      });

      // Get counts by date
      const dateCounts = await prisma.survey.groupBy({
        by: ["timestamp"],
        where: whereClause,
        _count: {
          answer: true,
        },
        orderBy: {
          timestamp: "asc",
        },
      });

      // Calculate totals
      const excellent =
        totalCounts.find((c) => c.answer === "EXCELLENT")?._count.answer || 0;
      const good =
        totalCounts.find((c) => c.answer === "GOOD")?._count.answer || 0;
      const poor =
        totalCounts.find((c) => c.answer === "POOR")?._count.answer || 0;
      const total = excellent + good + poor;

      // Calculate percentages
      const percentages = {
        excellent: total > 0 ? Math.round((excellent / total) * 100) : 0,
        good: total > 0 ? Math.round((good / total) * 100) : 0,
        poor: total > 0 ? Math.round((poor / total) * 100) : 0,
      };

      // Process location stats
      const locationMap = new Map<string, any>();
      locationCounts.forEach((item) => {
        if (!locationMap.has(item.location)) {
          locationMap.set(item.location, {
            location: item.location,
            total: 0,
            excellent: 0,
            good: 0,
            poor: 0,
          });
        }

        const locationStat = locationMap.get(item.location)!;
        locationStat[item.answer.toLowerCase()] = item._count.answer;
        locationStat.total += item._count.answer;
      });

      const byLocation = Array.from(locationMap.values()).map((location) => ({
        ...location,
        percentages: {
          excellent:
            location.total > 0
              ? Math.round((location.excellent / location.total) * 100)
              : 0,
          good:
            location.total > 0
              ? Math.round((location.good / location.total) * 100)
              : 0,
          poor:
            location.total > 0
              ? Math.round((location.poor / location.total) * 100)
              : 0,
        },
      }));

      // Process date stats (group by day)
      const dateMap = new Map<string, any>();
      dateCounts.forEach((item) => {
        const date = item.timestamp.toISOString().split("T")[0];
        if (!dateMap.has(date)) {
          dateMap.set(date, {
            date,
            total: 0,
            excellent: 0,
            good: 0,
            poor: 0,
          });
        }
        dateMap.get(date)!.total += item._count.answer;
      });

      const byDate = Array.from(dateMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return {
        total,
        excellent,
        good,
        poor,
        percentages,
        byLocation,
        byDate,
      };
    } catch (error) {
      logger.error("Get survey stats error", { filters, error });
      throw error;
    }
  }

  /**
   * Get surveys with pagination
   */
  static async getSurveys(query: any): Promise<{
    surveys: any[];
    pagination: any;
  }> {
    try {
      const { page, limit, skip, sortBy, sortOrder } = parsePagination(query);
      const filters: SurveyFilters = {};

      if (query.location) filters.location = query.location;
      if (query.answer) filters.answer = query.answer;
      if (query.startDate) filters.startDate = new Date(query.startDate);
      if (query.endDate) filters.endDate = new Date(query.endDate);
      if (query.deviceId) filters.deviceId = query.deviceId;

      const whereClause = this.buildWhereClause(filters);

      // Get total count
      const total = await prisma.survey.count({
        where: whereClause,
      });

      // Get surveys
      const surveys = await prisma.survey.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          device: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });

      const pagination = calculatePagination(page, limit, total);

      return {
        surveys,
        pagination,
      };
    } catch (error) {
      logger.error("Get surveys error", { query, error });
      throw error;
    }
  }

  /**
   * Get surveys by location
   */
  static async getSurveysByLocation(
    locationId: string,
    query: any
  ): Promise<{
    surveys: any[];
    pagination: any;
  }> {
    try {
      const { page, limit, skip, sortBy, sortOrder } = parsePagination(query);

      const whereClause = {
        location: locationId,
        ...(query.startDate && {
          createdAt: {
            gte: new Date(query.startDate),
            ...(query.endDate && { lte: new Date(query.endDate) }),
          },
        }),
      };

      // Get total count
      const total = await prisma.survey.count({
        where: whereClause,
      });

      // Get surveys
      const surveys = await prisma.survey.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          device: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });

      const pagination = calculatePagination(page, limit, total);

      return {
        surveys,
        pagination,
      };
    } catch (error) {
      logger.error("Get surveys by location error", {
        locationId,
        query,
        error,
      });
      throw error;
    }
  }

  /**
   * Export surveys to CSV/JSON
   */
  static async exportSurveys(
    filters: SurveyFilters = {},
    format: "csv" | "json" = "csv"
  ): Promise<string> {
    try {
      const whereClause = this.buildWhereClause(filters);

      // Limit export to prevent memory issues
      const maxRecords = 50000;
      const surveys = await prisma.survey.findMany({
        where: whereClause,
        take: maxRecords,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          device: {
            select: {
              name: true,
              location: true,
            },
          },
        },
      });

      if (format === "json") {
        return JSON.stringify(surveys, null, 2);
      }

      // CSV format
      const fields = [
        { label: "ID", value: "id" },
        { label: "Device ID", value: "deviceId" },
        { label: "Device Name", value: "device.name" },
        { label: "Location", value: "location" },
        { label: "Answer", value: "answer" },
        { label: "Timestamp", value: "timestamp" },
        { label: "Device Model", value: "deviceInfo.model" },
        { label: "Device OS", value: "deviceInfo.os" },
        { label: "Device Version", value: "deviceInfo.version" },
        { label: "App Version", value: "deviceInfo.appVersion" },
        { label: "Sync Status", value: "syncStatus" },
        { label: "Created At", value: "createdAt" },
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(surveys);

      logger.info(`Exported ${surveys.length} surveys in ${format} format`);

      return csv;
    } catch (error) {
      logger.error("Export surveys error", { filters, format, error });
      throw error;
    }
  }

  /**
   * Delete old surveys (data retention)
   */
  static async cleanupOldSurveys(daysToKeep: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.survey.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(
        `Cleaned up ${result.count} old surveys older than ${daysToKeep} days`
      );

      return result.count;
    } catch (error) {
      logger.error("Survey cleanup error", { daysToKeep, error });
      throw error;
    }
  }

  /**
   * Get analytics data
   */
  static async getAnalytics(
    period: "day" | "week" | "month" = "week"
  ): Promise<any> {
    try {
      const now = new Date();
      let startDate: Date;

      // Calculate start date based on period
      switch (period) {
        case "day":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const whereClause = {
        createdAt: {
          gte: startDate,
          lte: now,
        },
      };

      // Get survey counts over time
      const surveys = await prisma.survey.findMany({
        where: whereClause,
        select: {
          answer: true,
          createdAt: true,
          location: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Process data for charting
      const analytics = {
        period,
        totalSurveys: surveys.length,
        responseDistribution: {
          excellent: surveys.filter((s) => s.answer === "EXCELLENT").length,
          good: surveys.filter((s) => s.answer === "GOOD").length,
          poor: surveys.filter((s) => s.answer === "POOR").length,
        },
        dailyBreakdown: this.processDailyBreakdown(surveys, period),
        locationBreakdown: this.processLocationBreakdown(surveys),
      };

      return analytics;
    } catch (error) {
      logger.error("Analytics error", { period, error });
      throw error;
    }
  }

  /**
   * Build where clause for filtering surveys
   */
  private static buildWhereClause(filters: SurveyFilters): any {
    const whereClause: any = {};

    if (filters.location) {
      whereClause.location = {
        contains: filters.location,
        mode: "insensitive",
      };
    }

    if (filters.answer) {
      whereClause.answer = filters.answer;
    }

    if (filters.deviceId) {
      whereClause.deviceId = filters.deviceId;
    }

    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) {
        whereClause.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        whereClause.createdAt.lte = filters.endDate;
      }
    }

    return whereClause;
  }

  /**
   * Process daily breakdown for analytics
   */
  private static processDailyBreakdown(surveys: any[], period: string): any[] {
    const dailyMap = new Map<string, any>();

    surveys.forEach((survey) => {
      const date = survey.createdAt.toISOString().split("T")[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          total: 0,
          excellent: 0,
          good: 0,
          poor: 0,
        });
      }

      const dayData = dailyMap.get(date);
      dayData.total++;
      dayData[survey.answer.toLowerCase()]++;
    });

    return Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  /**
   * Process location breakdown for analytics
   */
  private static processLocationBreakdown(surveys: any[]): any[] {
    const locationMap = new Map<string, any>();

    surveys.forEach((survey) => {
      if (!locationMap.has(survey.location)) {
        locationMap.set(survey.location, {
          location: survey.location,
          total: 0,
          excellent: 0,
          good: 0,
          poor: 0,
        });
      }

      const locationData = locationMap.get(survey.location);
      locationData.total++;
      locationData[survey.answer.toLowerCase()]++;
    });

    return Array.from(locationMap.values()).sort((a, b) => b.total - a.total);
  }
}
