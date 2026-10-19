import envConfig from "../configurations/env.configuration.js";
import AppError from "../errors/app.error.js";
import Kyc from "../models/kyc.model.js";
/** Whether verification-only features are locked (KYC_ENFORCEMENT=on). */
export const isKycEnforced = () => envConfig.KYC_ENFORCEMENT?.trim().toLowerCase() === "on";
// Live tracking is the one feature kept for verified businesses: anyone can
// request freight and follow their bookings, but carrier tracking waits for
// verification. Staff are never blocked. Only applies while
// KYC_ENFORCEMENT=on; the frontend shows a locked panel too, and this is the
// check that can't be skipped by calling the API directly.
export const requireVerifiedForTracking = async (req, res, next) => {
    if (!isKycEnforced() || req.user.role !== "customer")
        return next();
    const verified = await Kyc.exists({
        user: req.user._id,
        status: "approved",
    });
    if (!verified)
        return next(new AppError("Verify your business to see live tracking.", 403));
    next();
};
// Sailing schedules are for verified businesses only, whether or not
// KYC_ENFORCEMENT is on. Staff are never blocked; the frontend shows a
// locked page too, and this is the check that can't be skipped.
export const requireVerifiedForSchedules = async (req, res, next) => {
    if (req.user.role !== "customer")
        return next();
    const verified = await Kyc.exists({
        user: req.user._id,
        status: "approved",
    });
    if (!verified)
        return next(new AppError("Verify your business to see sailing schedules.", 403));
    next();
};
//# sourceMappingURL=kyc.js.map