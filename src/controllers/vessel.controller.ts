import type { NextFunction, Request, Response } from "express";
import AppError from "../errors/app.error.js";
import { searchVessels as searchMaerskVessels } from "../integrations/maersk/vessels.client.js";

// STAFF: Vessel name typeahead backed by the Maersk Vessels API
export const searchVessels = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Maersk rejects anything outside ^[a-zA-Z0-9 .-]{2,35}$ with a 400
  const q = String(req.query.q ?? "")
    .replace(/[^a-zA-Z0-9 .-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 35)
    .trim();

  if (q.length < 2)
    return next(new AppError("Enter at least 2 characters to search", 400));

  const data = await searchMaerskVessels(q);

  res.status(200).json({ status: "success", results: data.length, data });
};
