import crypto from "crypto";
export const generateOTP = () => crypto.randomInt(100000, 1000000).toString();
export const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};
//# sourceMappingURL=otp.js.map