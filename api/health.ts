import { Request, Response } from "express";

export default function handler(req: Request, res: Response) {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Health check endpoint working",
    environment: process.env.NODE_ENV || "development",
  });
}
