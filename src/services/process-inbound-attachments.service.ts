import axios from "axios";
import { uploadBufferToCloudinary } from "../utils/upload-to-cloudinary.js";
import { resend } from "./email.service.js";

interface RawAttachment {
  id: string;
  filename: string;
  content_type: string;
  content_id?: string;
  content_disposition?: string;
  size?: number;
}

interface SavedAttachment {
  id: string;
  filename: string;
  content_type: string;
  size?: number;
  url: string;
}

export const processInboundAttachments = async (
  emailId: string,
  attachments: RawAttachment[] = [],
): Promise<SavedAttachment[]> => {
  try {
    if (!attachments.length) return [];

    const uploadedFiles = await Promise.all(
      attachments.map(async (file) => {
        const { data, error } = await resend.emails.receiving.attachments.get({
          id: file.id,
          emailId,
        });

        if (error)
          throw new Error(`Failed to retrieve attachment: ${file.filename}`);

        const response = await axios.get(data.download_url, {
          responseType: "arraybuffer",
        });

        const buffer = Buffer.from(response.data);

        const uploaded = await uploadBufferToCloudinary(buffer);

        return {
          id: file.id,
          filename: file.filename,
          content_type: file.content_type,
          size: file.size,
          url: uploaded.secure_url,
        };
      }),
    );

    return uploadedFiles;
  } catch (error) {
    console.error(error);
  }
};
