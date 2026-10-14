import cloudinary from "../configurations/cloudinary.configuration.js";
import AppError from "../errors/app.error.js";
import type { IKycUpload } from "../utils/interface.js";
import { uploadPrivateToCloudinary } from "../utils/upload-to-cloudinary.js";

// Storage for business verification documents (IDs, CAC certificates, ...).
// Files are private Cloudinary assets: nothing is publicly reachable, and
// every view goes through a signed link that expires within minutes.

export const KYC_LINK_TTL_SECONDS = 5 * 60;

/** Uploads one file into the customer's own folder and describes it. */
export const storeKycFile = async (
  file: Express.Multer.File,
  userId: string,
): Promise<Omit<IKycUpload, "_id">> => {
  try {
    const result = await uploadPrivateToCloudinary(file, `kyc/${userId}`);
    return {
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error("[kyc-storage] upload failed:", error);
    // Cloudinary answers 400 for files it can't read (corrupt or mislabelled).
    if ((error as { http_code?: number })?.http_code === 400)
      throw new AppError(
        "This file couldn't be read. Upload a different copy as a PDF, JPG or PNG.",
        400,
      );
    throw new AppError("The upload didn't go through. Try again.", 502);
  }
};

/** A signed link to the file that stops working after `ttlSeconds`. */
export const kycFileLink = (
  upload: Pick<IKycUpload, "publicId" | "resourceType" | "format">,
  ttlSeconds = KYC_LINK_TTL_SECONDS,
) =>
  cloudinary.utils.private_download_url(upload.publicId, upload.format ?? "", {
    resource_type: upload.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });

/** Deletes the file from Cloudinary. Failures are logged, not thrown. */
export const removeKycFile = async (
  upload: Pick<IKycUpload, "publicId" | "resourceType">,
) => {
  try {
    await cloudinary.uploader.destroy(upload.publicId, {
      type: "authenticated",
      resource_type: upload.resourceType,
      invalidate: true,
    });
  } catch (error) {
    console.error("[kyc-storage] delete failed:", upload.publicId, error);
  }
};
