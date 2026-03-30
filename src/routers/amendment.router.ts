import { Router } from "express";
import {
  createAmendment,
  getAmendmentById,
  getAmendmentsByBooking,
  updateAmendmentStatus,
} from "../controllers/amendment.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { upload } from "../middlewares/multer.js";

const amendmentRouter = Router();

amendmentRouter.use(authenticate);

amendmentRouter.post(
  "/",
  authorize("customer"),
  upload.single("amendment"),
  createAmendment,
);

amendmentRouter.get("/:bookingId", getAmendmentsByBooking);

amendmentRouter.get("/:amendmentId", getAmendmentById);

amendmentRouter.patch(
  "/:amendmentId/status",
  authorize("admin"),
  updateAmendmentStatus,
);

export default amendmentRouter;
