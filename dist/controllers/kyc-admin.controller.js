import { isValidObjectId } from "mongoose";
import AppError from "../errors/app.error.js";
import Kyc from "../models/kyc.model.js";
import User from "../models/user.model.js";
import { sendKycApprovedEmail, sendKycChangesEmail, sendKycRejectedEmail, } from "../services/kyc-email.service.js";
import { toKycResponse } from "../services/kyc.service.js";
import { kycFieldLabel, kycReviewSchema, } from "../validations/kyc.validation.js";
// Staff (admin / CSO) side of business verification.
const QUEUES = {
    awaiting: ["submitted", "in_review"],
    changes_requested: ["changes_requested"],
    approved: ["approved"],
    rejected: ["rejected"],
};
// Only an application waiting for review can be decided. Listed explicitly,
// like updateBookingStatus, so no other move is possible.
const REVIEWABLE = ["submitted", "in_review"];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const applicantOf = (kyc) => ({
    fullname: kyc.user?.fullname ?? "",
    email: kyc.user?.email ?? "",
});
// GET /kyc/admin?queue=awaiting&search=&page=1&limit=20
export const listKycApplications = async (req, res) => {
    const queue = typeof req.query.queue === "string" && req.query.queue in QUEUES
        ? req.query.queue
        : "awaiting";
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = { status: { $in: [...QUEUES[queue]] } };
    if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        const applicants = await User.find({ $or: [{ fullname: pattern }, { email: pattern }] }, { _id: 1 }).limit(200);
        filter.$or = [
            { "business.legalName": pattern },
            { "business.cacNumber": pattern },
            { user: { $in: applicants.map((user) => user._id) } },
        ];
    }
    // Waiting longest first while awaiting; most recent first afterwards.
    const sort = queue === "awaiting" ? { submittedAt: 1 } : { updatedAt: -1 };
    const [items, total, counts] = await Promise.all([
        Kyc.find(filter)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .select("status accountType business.legalName business.cacType business.cacNumber submittedAt updatedAt user")
            .populate("user", "fullname email"),
        Kyc.countDocuments(filter),
        Kyc.aggregate([
            { $match: { status: { $ne: "draft" } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
    ]);
    const byStatus = Object.fromEntries(counts.map(({ _id, count }) => [_id, count]));
    const queueCounts = Object.fromEntries(Object.keys(QUEUES).map((key) => [
        key,
        QUEUES[key].reduce((sum, status) => sum + (byStatus[status] ?? 0), 0),
    ]));
    res.status(200).json({
        status: "success",
        data: items.map((kyc) => ({
            id: kyc._id.toString(),
            status: kyc.status,
            accountType: kyc.accountType,
            business: {
                legalName: kyc.business.legalName,
                cacType: kyc.business.cacType,
                cacNumber: kyc.business.cacNumber,
            },
            applicant: applicantOf(kyc),
            submittedAt: kyc.submittedAt?.toISOString(),
            updatedAt: kyc.updatedAt.toISOString(),
        })),
        total,
        page,
        limit,
        counts: queueCounts,
    });
};
// GET /kyc/admin/:id. Opening a newly submitted application claims it for review.
export const getKycApplication = async (req, res, next) => {
    const { id } = req.params;
    if (!isValidObjectId(id))
        return next(new AppError("Application not found.", 404));
    // Atomic, so two reviewers opening it at once record one start.
    await Kyc.updateOne({ _id: id, status: "submitted" }, {
        $set: { status: "in_review" },
        $push: { history: { action: "review_started", by: req.user._id, at: new Date() } },
    });
    const kyc = await Kyc.findById(id).populate("user", "fullname email");
    if (!kyc || kyc.status === "draft")
        return next(new AppError("Application not found.", 404));
    res.status(200).json({
        status: "success",
        data: {
            ...toKycResponse(kyc),
            applicant: applicantOf(kyc),
        },
    });
};
// PATCH /kyc/admin/:id/review
// { decision: "approve" } | { decision: "changes", notes } | { decision: "reject", reason }
export const reviewKycApplication = async (req, res, next) => {
    const { id } = req.params;
    if (!isValidObjectId(id))
        return next(new AppError("Application not found.", 404));
    const parsed = kycReviewSchema.safeParse(req.body);
    if (!parsed.success)
        return next(new AppError(parsed.error.issues[0]?.message ?? "Check the decision.", 400));
    const decision = parsed.data;
    const now = new Date();
    const reviewer = req.user._id;
    const update = decision.decision === "approve"
        ? {
            $set: { status: "approved", reviewNotes: [], reviewedAt: now, reviewedBy: reviewer },
            $unset: { rejectionReason: 1 },
            $push: { history: { action: "approved", by: reviewer, at: now } },
        }
        : decision.decision === "changes"
            ? {
                $set: {
                    status: "changes_requested",
                    reviewNotes: Object.entries(decision.notes).map(([path, note]) => ({ path, note })),
                    reviewedAt: now,
                    reviewedBy: reviewer,
                },
                $push: { history: { action: "changes_requested", by: reviewer, at: now } },
            }
            : {
                $set: {
                    status: "rejected",
                    rejectionReason: decision.reason,
                    reviewNotes: [],
                    reviewedAt: now,
                    reviewedBy: reviewer,
                },
                $push: { history: { action: "rejected", by: reviewer, at: now, note: decision.reason } },
            };
    // Only moves an application that's still waiting; a second reviewer
    // deciding at the same moment gets the 409 below instead.
    const kyc = await Kyc.findOneAndUpdate({ _id: id, status: { $in: REVIEWABLE } }, update, { new: true }).populate("user", "fullname email");
    if (!kyc) {
        const exists = await Kyc.exists({ _id: id, status: { $ne: "draft" } });
        return next(exists
            ? new AppError("This application has already been reviewed.", 409)
            : new AppError("Application not found.", 404));
    }
    const applicant = applicantOf(kyc);
    const businessName = kyc.business.legalName;
    const directorNames = kyc.directors.map((director) => director.fullName);
    const email = decision.decision === "approve"
        ? await sendKycApprovedEmail(applicant, businessName)
        : decision.decision === "changes"
            ? await sendKycChangesEmail(applicant, businessName, Object.entries(decision.notes).map(([path, note]) => ({
                label: kycFieldLabel(path, directorNames) ?? path,
                note,
            })))
            : await sendKycRejectedEmail(applicant, businessName, decision.reason);
    // The decision stands either way; a failed email is logged, not fatal.
    if (email.error)
        console.error("[kyc] decision email failed:", email.error);
    const messages = {
        approve: `${businessName} is verified.`,
        changes: `Changes requested from ${businessName}.`,
        reject: `${businessName} was rejected.`,
    };
    res.status(200).json({
        status: "success",
        message: messages[decision.decision],
        data: { ...toKycResponse(kyc), applicant },
    });
};
//# sourceMappingURL=kyc-admin.controller.js.map