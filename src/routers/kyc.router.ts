import { Router, type RequestHandler } from "express";
import {
  getMyKyc,
  openKycDocument,
  removeMyKycDocument,
  saveMyKyc,
  submitMyKyc,
  uploadMyKycDocument,
} from "../controllers/kyc.controller.js";
import {
  getKycApplication,
  listKycApplications,
  reviewKycApplication,
} from "../controllers/kyc-admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { kycUpload } from "../middlewares/multer.js";
import {
  kycDocumentRateLimiter,
  kycUploadRateLimiter,
} from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";

// Business verification (KYC).
const kycRouter = Router();

kycRouter.use(authenticate);

// The customer's own application.
kycRouter.get("/me", authorize("customer"), catchAsync(getMyKyc));
kycRouter.patch("/me", authorize("customer"), catchAsync(saveMyKyc));
kycRouter.post(
  "/me/documents",
  authorize("customer"),
  kycUploadRateLimiter,
  kycUpload,
  catchAsync(uploadMyKycDocument),
);
kycRouter.delete(
  "/me/documents/:docId",
  authorize("customer"),
  catchAsync(removeMyKycDocument),
);
kycRouter.post("/me/submit", authorize("customer"), catchAsync(submitMyKyc));

// Staff: review queue, application, decision.
kycRouter.get(
  "/admin",
  authorize("admin", "cso"),
  catchAsync(listKycApplications),
);
kycRouter.get(
  "/admin/:id",
  authorize("admin", "cso"),
  catchAsync(getKycApplication),
);
kycRouter.patch(
  "/admin/:id/review",
  authorize("admin", "cso"),
  catchAsync(reviewKycApplication),
);

// Owner or staff; the controller checks which documents each may open.
// The frontend shows image documents as <img> thumbnails from another
// origin, which helmet's default CORP (same-origin) blocks. Allow it on this
// route only: access still needs the owner's or staff login, and another site
// embedding it gets an image it cannot read.
const allowEmbedding: RequestHandler = (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
};

kycRouter.get(
  "/documents/:docId",
  allowEmbedding,
  authorize("customer", "admin", "cso"),
  kycDocumentRateLimiter,
  catchAsync(openKycDocument),
);

export default kycRouter;
