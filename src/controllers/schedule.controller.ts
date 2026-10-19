import type { NextFunction, Request, Response } from "express";
import AppError from "../errors/app.error.js";
import { UN_LOCODE_REGEX } from "../integrations/maersk/locations.client.js";
import {
  getActivePorts as getMaerskActivePorts,
  getPortSchedule as getMaerskPortSchedule,
} from "../integrations/maersk/schedules.client.js";

const DAY = 24 * 60 * 60 * 1000;
const DAY_OPTIONS = [3, 7, 10, 14];
// Maersk serves port schedules from 90 days back to 180 days ahead
const MAX_DAYS_BACK = 90;
const MAX_DAYS_AHEAD = 180;

const today = () => new Date().toISOString().slice(0, 10);

// AUTHENTICATED: every port Maersk calls at, for the country and port pickers
export const getActivePorts = async (_req: Request, res: Response) => {
  const data = await getMaerskActivePorts();
  res.status(200).json({ status: "success", results: data.length, data });
};

// AUTHENTICATED: vessel calls at one port, e.g.
// /schedules/ports?port=NGAPP&from=2026-10-19&days=7
export const getPortSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const port = String(req.query.port ?? "").trim().toUpperCase();
  if (!UN_LOCODE_REGEX.test(port))
    return next(new AppError("Choose a port to see its schedule", 400));

  const from = String(req.query.from ?? "").trim() || today();
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(fromTime))
    return next(new AppError("Enter the date as YYYY-MM-DD", 400));

  const offsetDays = (fromTime - Date.parse(`${today()}T00:00:00Z`)) / DAY;
  if (offsetDays < -MAX_DAYS_BACK || offsetDays > MAX_DAYS_AHEAD)
    return next(
      new AppError(
        "Pick a date within 90 days before or 180 days after today",
        400,
      ),
    );

  const days = req.query.days === undefined ? 7 : Number(req.query.days);
  if (!DAY_OPTIONS.includes(days))
    return next(new AppError("Days must be 3, 7, 10 or 14", 400));

  const data = await getMaerskPortSchedule(port, from, days);
  res.status(200).json({ status: "success", data });
};
