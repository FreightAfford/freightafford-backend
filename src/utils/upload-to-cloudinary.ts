import streamifier from "streamifier";
import cloudinary from "../configurations/cloudinary.configuration.js";

export const uploadToCloudinary = (
  file: Express.Multer.File,
  folder = "bill_of_lading",
) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res);
      },
    );

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

export const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder = "tickets",
) => {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res);
      },
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};
