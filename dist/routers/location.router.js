import { Router } from "express";
import { searchLocations } from "../controllers/location.controller.js";
import { authenticate } from "../middlewares/auth/protection.js";
import { locationRateLimiter } from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";
const locationRouter = Router();
locationRouter.use(authenticate);
locationRouter.get("/", locationRateLimiter, catchAsync(searchLocations));
export default locationRouter;
//# sourceMappingURL=location.router.js.map