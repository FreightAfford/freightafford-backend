import multer from "multer";

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
