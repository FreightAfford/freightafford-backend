import { Router } from "express";
import { searchVessels } from "../controllers/vessel.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { vesselRateLimiter } from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";

const vesselRouter = Router();

vesselRouter.use(authenticate);
vesselRouter.use(authorize("admin", "cso"));

vesselRouter.get("/", vesselRateLimiter, catchAsync(searchVessels));

export default vesselRouter;
