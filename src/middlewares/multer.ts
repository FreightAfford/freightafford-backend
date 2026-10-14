import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import AppError from "../errors/app.error.js";

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  // pdf
  "application/pdf",

  // word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // text
  "text/plain",
  "text/csv",

  // images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Unsupported file format"));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Business verification documents: only what a reviewer can open and read.
const kycMimeTypes = ["application/pdf", "image/jpeg", "image/png"];

const kycMulter = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (kycMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new AppError("Upload a PDF, JPG or PNG file.", 400));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB, one at a time
}).single("file");

// Turns multer's own errors (too big, wrong field) into clear 400s instead
// of generic 500s.
export const kycUpload = (req: Request, res: Response, next: NextFunction) =>
  kycMulter(req, res, (err: unknown) => {
    if (!err) {
      if (!req.file) return next(new AppError("Choose a file to upload.", 400));
      return next();
    }
    if (err instanceof AppError) return next(err);
    if (err instanceof multer.MulterError)
      return next(
        new AppError(
          err.code === "LIMIT_FILE_SIZE"
            ? "This file is over 5 MB. Upload a smaller one."
            : "Upload one file, in the field named \"file\".",
          400,
        ),
      );
    next(err);
  });
