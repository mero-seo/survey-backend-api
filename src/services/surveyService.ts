import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { AppError } from "../utils/appError";
import { calculatePagination, parsePagination } from "../utils/response";
import { Parser } from "json2csv";
import { SurveyAnswer } from "@prisma/client";
import { Prisma } from "@prisma/client";

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
  satisfactory: number;
  average: number;
  percentages: {
    excellent: number;
    satisfactory: number;
    average: number;
  };
  byLocation: Array<{
    location: string;
    total: number;
    excellent: number;
    satisfactory: number;
    average: number;
    percentages: {
      excellent: number;
      satisfactory: number;
      average: number;
    };
  }>;
  byDate: Array<{
    date: string;
    total: number;
    excellent: number;
    satisfactory: number;
    average: number;
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
  timeShift?: string; // 'morning', 'day', 'night'
  deviceName?: string;
  syncStatus?: string;
  search?: string; // General search across multiple fields
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
  static async getStats(query: any): Promise<SurveyStats> {
    try {
      const filters: SurveyFilters = {};
      if (query.location) filters.location = query.location;
      if (query.answer) filters.answer = query.answer;
      if (query.startDate) filters.startDate = new Date(query.startDate);
      if (query.endDate) filters.endDate = new Date(query.endDate);
      if (query.deviceId) filters.deviceId = query.deviceId;
      if (query.timeShift) filters.timeShift = query.timeShift;
      if (query.deviceName) filters.deviceName = query.deviceName;
      if (query.syncStatus) filters.syncStatus = query.syncStatus;
      if (query.search) filters.search = query.search;

      const whereClause = this.buildWhereClause(filters);
      const { timeShiftAggregation, ...prismaWhere } = whereClause;

      let total = 0;
      let excellent = 0;
      let satisfactory = 0;
      let average = 0;
      let byLocation: any[] = [];
      let byDate: any[] = [];

      if (timeShiftAggregation) {
        const pipeline = [
          { $match: { $expr: timeShiftAggregation } },
          {
            $lookup: {
              from: "devices",
              localField: "deviceId",
              foreignField: "deviceId",
              as: "device",
            },
          },
          { $unwind: { path: "$device", preserveNullAndEmptyArrays: true } },
          { $match: prismaWhere },
          { $group: { _id: "$answer", count: { $sum: 1 } } },
        ];
        const result = await prisma.$runCommandRaw({
          aggregate: "surveys",
          pipeline,
          cursor: {},
        });
        const totalCounts = (result as any)?.cursor?.firstBatch || [];

        excellent =
          totalCounts.find((c: any) => c._id === "EXCELLENT")?.count || 0;
        satisfactory =
          totalCounts.find((c: any) => c._id === "SATISFACTORY")?.count || 0;
        average = totalCounts.find((c: any) => c._id === "AVERAGE")?.count || 0;
        total = excellent + satisfactory + average;
        // NOTE: byLocation and byDate are intentionally left empty for timeShift queries to avoid complexity.
      } else {
        const totalCountsResult = await prisma.survey.groupBy({
          by: ["answer"],
          where: prismaWhere,
          _count: { answer: true },
        });
        excellent =
          totalCountsResult.find((c) => c.answer === "EXCELLENT")?._count
            .answer || 0;
        satisfactory =
          totalCountsResult.find((c) => c.answer === "SATISFACTORY")?._count
            .answer || 0;
        average =
          totalCountsResult.find((c) => c.answer === "AVERAGE")?._count
            .answer || 0;
        total = excellent + satisfactory + average;

        const byLocationResult = await prisma.survey.groupBy({
          by: ["location", "answer"],
          where: prismaWhere,
          _count: { answer: true },
        });
        const locationMap = new Map<string, any>();
        byLocationResult.forEach((item) => {
          if (!locationMap.has(item.location)) {
            locationMap.set(item.location, {
              location: item.location,
              total: 0,
              excellent: 0,
              satisfactory: 0,
              average: 0,
            });
          }
          const loc = locationMap.get(item.location);
          loc.total += item._count.answer;
          if (item.answer === "EXCELLENT") loc.excellent += item._count.answer;
          if (item.answer === "SATISFACTORY")
            loc.satisfactory += item._count.answer;
          if (item.answer === "AVERAGE") loc.average += item._count.answer;
        });
        byLocation = Array.from(locationMap.values()).map((loc) => ({
          ...loc,
          percentages: {
            excellent:
              loc.total > 0 ? Math.round((loc.excellent / loc.total) * 100) : 0,
            satisfactory:
              loc.total > 0
                ? Math.round((loc.satisfactory / loc.total) * 100)
                : 0,
            average:
              loc.total > 0 ? Math.round((loc.average / loc.total) * 100) : 0,
          },
        }));

        const byDateResult = await prisma.survey.groupBy({
          by: ["timestamp"],
          where: prismaWhere,
          _count: { answer: true },
          orderBy: { timestamp: "asc" },
        });
        const dateMap = new Map<string, any>();
        byDateResult.forEach((item) => {
          const date = (item.timestamp as Date).toISOString().split("T")[0];
          if (!dateMap.has(date)) {
            dateMap.set(date, {
              date,
              total: 0,
              excellent: 0,
              satisfactory: 0,
              average: 0,
            });
          }
          dateMap.get(date).total += item._count.answer;
        });
        byDate = Array.from(dateMap.values());
      }

      const percentages = {
        excellent: total > 0 ? Math.round((excellent / total) * 100) : 0,
        satisfactory: total > 0 ? Math.round((satisfactory / total) * 100) : 0,
        average: total > 0 ? Math.round((average / total) * 100) : 0,
      };

      return {
        total,
        excellent,
        satisfactory,
        average,
        percentages,
        byLocation,
        byDate,
      };
    } catch (error) {
      logger.error("Get survey stats error", { query, error });
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
      if (query.timeShift) filters.timeShift = query.timeShift;
      if (query.deviceName) filters.deviceName = query.deviceName;
      if (query.syncStatus) filters.syncStatus = query.syncStatus;
      if (query.search) filters.search = query.search;

      const whereClause = this.buildWhereClause(filters);

      let surveys: any[];
      let total: number;

      if (whereClause.timeShiftAggregation) {
        const { timeShiftAggregation, ...prismaWhere } = whereClause;

        const pipeline: any[] = [
          { $match: { $expr: timeShiftAggregation } },
          {
            $lookup: {
              from: "devices",
              localField: "deviceId",
              foreignField: "deviceId",
              as: "device",
            },
          },
          { $unwind: { path: "$device", preserveNullAndEmptyArrays: true } },
          { $match: prismaWhere },
          { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },
        ];

        const countPipeline = [...pipeline, { $count: "total" }];
        const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

        const [totalResult, dataResult] = await Promise.all([
          prisma.$runCommandRaw({
            aggregate: "surveys",
            pipeline: countPipeline,
            cursor: {},
          }),
          prisma.$runCommandRaw({
            aggregate: "surveys",
            pipeline: dataPipeline,
            cursor: {},
          }),
        ]);

        // Extract total from the raw aggregation result
        total = (totalResult as any)?.cursor?.firstBatch?.[0]?.total || 0;
        // Extract documents from the raw aggregation result
        surveys = (dataResult as any)?.cursor?.firstBatch || [];
      } else {
        total = await prisma.survey.count({ where: whereClause });
        surveys = await prisma.survey.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            device: {
              select: { id: true, name: true, status: true, location: true },
            },
          },
        });
      }

      const pagination = calculatePagination(page, limit, total);

      return { surveys, pagination };
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

      // Create a filter object and add the locationId to it
      const filters: SurveyFilters = {};
      if (query.answer) filters.answer = query.answer;
      if (query.startDate) filters.startDate = new Date(query.startDate);
      if (query.endDate) filters.endDate = new Date(query.endDate);
      if (query.deviceId) filters.deviceId = query.deviceId;
      if (query.timeShift) filters.timeShift = query.timeShift;
      if (query.deviceName) filters.deviceName = query.deviceName;
      if (query.syncStatus) filters.syncStatus = query.syncStatus;
      if (query.search) filters.search = query.search;
      filters.location = locationId; // Always filter by the location from the URL

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
          excellent: surveys.filter((s) => s.answer === SurveyAnswer.EXCELLENT)
            .length,
          satisfactory: surveys.filter(
            (s) => s.answer === SurveyAnswer.SATISFACTORY
          ).length,
          average: surveys.filter((s) => s.answer === SurveyAnswer.AVERAGE)
            .length,
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
   * Convert UTC time to Nepal time (UTC+5:45)
   */
  private static convertToNepalTime(utcDate: Date): {
    hours: number;
    minutes: number;
  } {
    const utcHours = utcDate.getUTCHours();
    const utcMinutes = utcDate.getUTCMinutes();

    // Nepal is UTC+5:45
    let nepalHours = utcHours + 5;
    let nepalMinutes = utcMinutes + 45;

    // Handle minute overflow
    if (nepalMinutes >= 60) {
      nepalHours += 1;
      nepalMinutes -= 60;
    }

    // Handle hour overflow
    if (nepalHours >= 24) {
      nepalHours -= 24;
    }

    return { hours: nepalHours, minutes: nepalMinutes };
  }

  /**
   * Get shift-based analytics for dashboard
   * Returns data grouped by time shifts (morning, day, night) and ratings (excellent, satisfactory, average)
   */
  static async getShiftAnalytics(filters: SurveyFilters = {}): Promise<any> {
    try {
      const whereClause = this.buildWhereClause(filters);
      const { timeShiftAggregation, ...prismaWhere } = whereClause;

      // Get all surveys with their timestamps
      const surveys = await prisma.survey.findMany({
        where: prismaWhere,
        select: {
          answer: true,
          timestamp: true,
          deviceId: true,
        },
        orderBy: {
          timestamp: "asc",
        },
      });

      // Group by shift and rating
      const shiftData = {
        morning: { excellent: 0, satisfactory: 0, average: 0 },
        day: { excellent: 0, satisfactory: 0, average: 0 },
        night: { excellent: 0, satisfactory: 0, average: 0 },
      };

      // Debug: Log a few sample timestamps to understand the timezone
      if (surveys.length > 0) {
        const sampleSurvey = surveys[0];
        const nepalTime = this.convertToNepalTime(sampleSurvey.timestamp);
        logger.info("Sample survey timestamp analysis", {
          originalTimestamp: sampleSurvey.timestamp,
          utcHours: sampleSurvey.timestamp.getUTCHours(),
          utcMinutes: sampleSurvey.timestamp.getUTCMinutes(),
          nepalHours: nepalTime.hours,
          nepalMinutes: nepalTime.minutes,
          isoString: sampleSurvey.timestamp.toISOString(),
        });
      }

      surveys.forEach((survey) => {
        // Convert UTC time to Nepal time
        const nepalTime = this.convertToNepalTime(survey.timestamp);
        const nepalHours = nepalTime.hours;

        let shift: "morning" | "day" | "night";

        // Updated shift definitions for Nepal timezone:
        // Morning: 6:00 AM - 11:59 AM (6-11)
        // Day: 12:00 PM - 5:59 PM (12-17)
        // Night: 6:00 PM - 5:59 AM (18-23, 0-5)
        if (nepalHours >= 6 && nepalHours < 12) {
          shift = "morning";
        } else if (nepalHours >= 12 && nepalHours < 18) {
          shift = "day";
        } else {
          shift = "night";
        }

        // Debug: Log some samples for verification
        if (Math.random() < 0.01) {
          // Log 1% of surveys for debugging
          logger.info("Shift calculation debug", {
            originalTimestamp: survey.timestamp,
            utcHours: survey.timestamp.getUTCHours(),
            nepalHours,
            calculatedShift: shift,
            answer: survey.answer,
          });
        }

        shiftData[shift][
          survey.answer.toLowerCase() as keyof typeof shiftData.morning
        ]++;
      });

      // Convert to chart format
      const chartData = [
        {
          shift: "Morning (6:00 AM - 11:59 AM)",
          excellent: shiftData.morning.excellent,
          satisfactory: shiftData.morning.satisfactory,
          average: shiftData.morning.average,
        },
        {
          shift: "Day (12:00 PM - 5:59 PM)",
          excellent: shiftData.day.excellent,
          satisfactory: shiftData.day.satisfactory,
          average: shiftData.day.average,
        },
        {
          shift: "Night (6:00 PM - 5:59 AM)",
          excellent: shiftData.night.excellent,
          satisfactory: shiftData.night.satisfactory,
          average: shiftData.night.average,
        },
      ];

      return {
        chartData,
        summary: {
          total: surveys.length,
          byShift: {
            morning: Object.values(shiftData.morning).reduce(
              (a, b) => a + b,
              0
            ),
            day: Object.values(shiftData.day).reduce((a, b) => a + b, 0),
            night: Object.values(shiftData.night).reduce((a, b) => a + b, 0),
          },
        },
      };
    } catch (error) {
      logger.error("Error getting shift analytics", { error, filters });
      throw error;
    }
  }

  /**
   * Build where clause for filtering surveys
   */
  static buildWhereClause(filters: SurveyFilters): any {
    const andConditions = [];

    if (filters.location) {
      andConditions.push({ location: filters.location });
    }

    if (filters.answer) {
      andConditions.push({ answer: filters.answer });
    }

    if (filters.startDate || filters.endDate) {
      const createdAt: any = {};
      if (filters.startDate) createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) createdAt.lte = new Date(filters.endDate);
      andConditions.push({ createdAt });
    }

    if (filters.deviceId) {
      andConditions.push({ deviceId: filters.deviceId });
    }

    if (filters.syncStatus) {
      andConditions.push({ syncStatus: filters.syncStatus });
    }

    if (filters.deviceName) {
      andConditions.push({
        "device.name": { contains: filters.deviceName, mode: "insensitive" },
      });
    }

    if (filters.search) {
      andConditions.push({
        OR: [
          { location: { contains: filters.search, mode: "insensitive" } },
          { deviceId: { contains: filters.search, mode: "insensitive" } },
          { answer: { contains: filters.search, mode: "insensitive" } },
          { "device.name": { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

    if (filters.timeShift) {
      // For MongoDB aggregation, we need to handle timezone conversion
      // Since Nepal is UTC+5:45, we need to adjust the hour ranges accordingly
      let timeShiftCondition;
      switch (filters.timeShift) {
        case "morning":
          // Morning: 6:00 AM - 11:59 AM Nepal time
          // This corresponds to 0:15 AM - 6:14 AM UTC
          // We'll use 0:00 AM - 6:00 AM UTC as an approximation
          timeShiftCondition = {
            $and: [
              { $gte: [{ $hour: "$timestamp" }, 0] },
              { $lt: [{ $hour: "$timestamp" }, 6] },
            ],
          };
          break;
        case "day":
          // Day: 12:00 PM - 5:59 PM Nepal time
          // This corresponds to 6:15 AM - 12:14 PM UTC
          // We'll use 6:00 AM - 12:00 PM UTC as an approximation
          timeShiftCondition = {
            $and: [
              { $gte: [{ $hour: "$timestamp" }, 6] },
              { $lt: [{ $hour: "$timestamp" }, 12] },
            ],
          };
          break;
        case "night":
          // Night: 6:00 PM - 5:59 AM Nepal time
          // This corresponds to 12:15 PM - 0:14 AM UTC (next day)
          // We'll use 12:00 PM - 0:00 AM UTC as an approximation
          timeShiftCondition = {
            $or: [
              { $gte: [{ $hour: "$timestamp" }, 12] },
              { $lt: [{ $hour: "$timestamp" }, 0] },
            ],
          };
          break;
      }
      if (timeShiftCondition) {
        // This is a special marker for aggregation pipeline
        where.timeShiftAggregation = timeShiftCondition;
      }
    }

    return where;
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
          satisfactory: 0,
          average: 0,
        });
      }

      const dayData = dailyMap.get(date);
      dayData.total++;
      if (survey.answer === SurveyAnswer.EXCELLENT) dayData.excellent++;
      if (survey.answer === SurveyAnswer.SATISFACTORY) dayData.satisfactory++;
      if (survey.answer === SurveyAnswer.AVERAGE) dayData.average++;
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
          satisfactory: 0,
          average: 0,
        });
      }

      const locationData = locationMap.get(survey.location);
      locationData.total++;
      if (survey.answer === SurveyAnswer.EXCELLENT) locationData.excellent++;
      if (survey.answer === SurveyAnswer.SATISFACTORY)
        locationData.satisfactory++;
      if (survey.answer === SurveyAnswer.AVERAGE) locationData.average++;
    });

    return Array.from(locationMap.values()).sort((a, b) => b.total - a.total);
  }
}
