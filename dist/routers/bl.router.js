import { Router } from "express";
import { deleteBillOfLading, getBLs, getBookingBL, getCustomerBLs, uploadBillOfLading, } from "../controllers/bl.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { upload } from "../middlewares/multer.js";
import catchAsync from "../utils/catch-async.js";
const BLRouter = Router();
BLRouter.post("/", authenticate, authorize("admin", "cso"), upload.single("document"), catchAsync(uploadBillOfLading));
BLRouter.get("/booking/:bookingId", authenticate, catchAsync(getBookingBL));
BLRouter.get("/", authenticate, catchAsync(getCustomerBLs));
BLRouter.get("/admin", authenticate, authorize("admin", "cso"), catchAsync(getBLs));
BLRouter.delete("/:blId", authenticate, authorize("admin"), catchAsync(deleteBillOfLading));
export default BLRouter;
//# sourceMappingURL=bl.router.js.map