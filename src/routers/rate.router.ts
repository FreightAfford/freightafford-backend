import { Router } from "express";
import {
  getRateLanes,
  requestRate,
  searchRates,
} from "../controllers/rate.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { requireVerifiedForRates } from "../middlewares/kyc.js";
import { rateRequestLimiter } from "../middlewares/rate.limiter.js";
import { validate } from "../middlewares/validate.js";
import catchAsync from "../utils/catch-async.js";
import { rateRequestInputSchema } from "../validations/rate.validation.js";

// /api/v1/rates. Fixed paths (search, lanes, requests, import) are declared
// before /:id, so they're never read as a rate id.

const rateRouter = Router();

rateRouter.use(authenticate);
// Customers need a verified business; staff always get through
rateRouter.use(catchAsync(requireVerifiedForRates));

// ---- Customer (and admin) ----
rateRouter.get("/search", catchAsync(searchRates));
rateRouter.get("/lanes", catchAsync(getRateLanes));
rateRouter.post(
  "/requests",
  authorize("customer"),
  rateRequestLimiter,
  validate(rateRequestInputSchema),
  catchAsync(requestRate),
);

export default rateRouter;
