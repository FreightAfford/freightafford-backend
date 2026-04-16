import { Router } from "express";
import { getAdminOverview, getCustomerOverview, } from "../controllers/pipeline.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
const pipelineRouter = Router();
pipelineRouter.get("/admin", authenticate, authorize("admin"), getAdminOverview);
pipelineRouter.get("/customer", authenticate, authorize("customer"), getCustomerOverview);
export default pipelineRouter;
//# sourceMappingURL=pipeline.router.js.map