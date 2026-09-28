import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "config.env") });
const envConfig = {
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI,
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_URL: process.env.CLIENT_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL: process.env.RESEND_EMAIL,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    MAERSK_API_KEY: process.env.MAERSK_API_KEY,
    MAERSK_LOCATIONS_URL: process.env.MAERSK_LOCATIONS_URL ||
        "https://api.maersk.com/reference-data/locations",
    MAERSK_COMMODITIES_URL: process.env.MAERSK_COMMODITIES_URL ||
        "https://api.maersk.com/commodity-classifications",
    MAERSK_VESSELS_URL: process.env.MAERSK_VESSELS_URL ||
        "https://api.maersk.com/reference-data/vessels",
    MAERSK_TRACKING_URL: process.env.MAERSK_TRACKING_URL ||
        "https://api.maersk.com/track-and-trace/public-events",
    // Kill switch for the Maersk status/date sync cron; on unless set to "false"
    MAERSK_TRACKING_SYNC_ENABLED: process.env.MAERSK_TRACKING_SYNC_ENABLED,
};
export default envConfig;
//# sourceMappingURL=env.configuration.js.map