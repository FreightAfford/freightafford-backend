import { Router } from "express";
import { checkRateImport, commitRateImport, createRate, deleteRate, expireRate, getRate, getRateLanes, listRateRequests, listRates, matchRateImport, requestRate, resolveRateRequest, searchRates, updateRate, } from "../controllers/rate.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { requireVerifiedForRates } from "../middlewares/kyc.js";
import { rateRequestLimiter } from "../middlewares/rate.limiter.js";
import { validate } from "../middlewares/validate.js";
import catchAsync from "../utils/catch-async.js";
import { importCheckSchema, importCommitSchema, importMatchSchema, rateInputSchema, rateRequestInputSchema, } from "../validations/rate.validation.js";
// /api/v1/rates. Fixed paths (search, lanes, requests, import) are declared
// before /:id, so they're never read as a rate id.
const rateRouter = Router();
const admin = authorize("admin");
rateRouter.use(authenticate);
// Customers need a verified business; staff always get through
rateRouter.use(catchAsync(requireVerifiedForRates));
// ---- Customer (and admin) ----
rateRouter.get("/search", catchAsync(searchRates));
rateRouter.get("/lanes", catchAsync(getRateLanes));
// ---- Rate requests ----
rateRouter
    .route("/requests")
    .get(admin, catchAsync(listRateRequests))
    .post(authorize("customer"), rateRequestLimiter, validate(rateRequestInputSchema), catchAsync(requestRate));
rateRouter.patch("/requests/:id/resolve", admin, catchAsync(resolveRateRequest));
// ---- Admin: import (bodies up to 5 MB, see app.config.ts) ----
rateRouter.post("/import/match", admin, validate(importMatchSchema), catchAsync(matchRateImport));
rateRouter.post("/import/check", admin, validate(importCheckSchema), catchAsync(checkRateImport));
rateRouter.post("/import", admin, validate(importCommitSchema), catchAsync(commitRateImport));
// ---- Admin: rates ----
rateRouter
    .route("/")
    .get(admin, catchAsync(listRates))
    .post(admin, validate(rateInputSchema), catchAsync(createRate));
rateRouter.post("/:id/expire", admin, catchAsync(expireRate));
rateRouter
    .route("/:id")
    .get(admin, catchAsync(getRate))
    .patch(admin, validate(rateInputSchema), catchAsync(updateRate))
    .delete(admin, catchAsync(deleteRate));
export default rateRouter;
//# sourceMappingURL=rate.router.js.map