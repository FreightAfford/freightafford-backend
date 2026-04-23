import streamifier from "streamifier";
import cloudinary from "../configurations/cloudinary.configuration.js";
export const uploadToCloudinary = (file, folder = "bill_of_lading") => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: "auto",
        }, (err, res) => {
            if (err)
                return reject(err);
            resolve(res);
        });
        streamifier.createReadStream(file.buffer).pipe(stream);
    });
};
//# sourceMappingURL=upload-to-cloudinary.js.map