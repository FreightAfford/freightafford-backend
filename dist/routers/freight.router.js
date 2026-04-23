import { Router } from "express";
import { acceptFreightRequest, counterFreightRequest, createFreightRequest, getAllFreightRequests, getFreightRequest, getMyFreightRequest, rejectFreightRequest, respondToCounter, } from "../controllers/freight.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import catchAsync from "../utils/catch-async.js";
const freightRouter = Router();
freightRouter.use(authenticate);
freightRouter.post("/", authorize("customer"), catchAsync(createFreightRequest));
freightRouter.get("/me", authorize("customer"), catchAsync(getMyFreightRequest));
freightRouter.get("/", authorize("admin", "cso"), catchAsync(getAllFreightRequests));
freightRouter.get("/:id", authorize("admin", "customer", "cso"), catchAsync(getFreightRequest));
freightRouter.patch("/admin/:id/accept", authorize("admin"), catchAsync(acceptFreightRequest));
freightRouter.patch("/admin/:id/counter", authorize("admin", "cso"), catchAsync(counterFreightRequest));
freightRouter.patch("/admin/:id/reject", authorize("admin", "cso"), catchAsync(rejectFreightRequest));
freightRouter.patch("/:id/respond", catchAsync(respondToCounter));
export default freightRouter;
//# sourceMappingURL=freight.router.js.map