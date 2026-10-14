import envConfig from "../configurations/env.configuration.js";
import AppError from "../errors/app.error.js";
import Kyc from "../models/kyc.model.js";
/** Whether unverified businesses are blocked from booking (KYC_ENFORCEMENT=on). */
export const isKycEnforced = () => envConfig.KYC_ENFORCEMENT?.trim().toLowerCase() === "on";
// Blocks freight requests from customers whose business isn't verified, but
// only while KYC_ENFORCEMENT=on. The frontend hides the button too; this is
// the check that can't be skipped by calling the API directly.
export const requireVerifiedBusiness = async (req, res, next) => {
    if (!isKycEnforced())
        return next();
    const verified = await Kyc.exists({
        user: req.user._id,
        status: "approved",
    });
    if (!verified)
        return next(new AppError("Verify your business before sending a freight request.", 403));
    next();
};
//# sourceMappingURL=kyc.js.map