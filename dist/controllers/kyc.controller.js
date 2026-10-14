import { isValidObjectId } from "mongoose";
import AppError from "../errors/app.error.js";
import { isKycEnforced } from "../middlewares/kyc.js";
import Kyc from "../models/kyc.model.js";
import { sendKycNewSubmissionEmail, sendKycReceivedEmail, } from "../services/kyc-email.service.js";
import { kycFileLink, removeKycFile, storeKycFile, } from "../services/kyc-storage.service.js";
import { applyKycDraft, assertEditable, documentReferencePaths, documentResponse, emptyKycResponse, KYC_EDITABLE, kycForChecks, toKycResponse, } from "../services/kyc.service.js";
import { kycDraftSchema, kycSubmissionProblems, } from "../validations/kyc.validation.js";
const STAFF_ROLES = ["admin", "cso"];
// A customer has at most this many files stored at once.
const MAX_UPLOADS = 40;
const findMine = (req) => Kyc.findOne({ user: req.user._id });
// Creates the record the first time it's needed. An upsert, so several first
// uploads at once (the wizard allows it) share one record instead of racing
// to create it.
const ensureMine = async (req) => {
    const user = req.user;
    const create = () => Kyc.findOneAndUpdate({ user: user._id }, {
        $setOnInsert: {
            user: user._id,
            accountType: user.accountType ?? "export_agent",
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    try {
        return (await create());
    }
    catch (error) {
        // Two upserts at the same instant: the loser just reads the winner's.
        if (error?.code === 11000)
            return (await findMine(req));
        throw error;
    }
};
// GET /kyc/me
export const getMyKyc = async (req, res) => {
    const kyc = await findMine(req);
    res.status(200).json({
        status: "success",
        // Tells the frontend whether bookings are actually blocked right now.
        enforcement: isKycEnforced(),
        data: kyc ? toKycResponse(kyc) : emptyKycResponse(req.user),
    });
};
// PATCH /kyc/me: save one or more steps, finished or not.
export const saveMyKyc = async (req, res, next) => {
    const parsed = kycDraftSchema.safeParse(req.body);
    if (!parsed.success)
        return next(new AppError(parsed.error.issues[0]?.message ?? "Check the details.", 400));
    const kyc = await ensureMine(req);
    assertEditable(kyc);
    applyKycDraft(kyc, parsed.data);
    // Saves only the steps' fields; uploads arriving meanwhile aren't touched.
    await kyc.save();
    res.status(200).json({
        status: "success",
        message: "Progress saved",
        data: toKycResponse(kyc),
    });
};
// POST /kyc/me/documents (multipart, field "file")
export const uploadMyKycDocument = async (req, res, next) => {
    const kyc = await ensureMine(req);
    assertEditable(kyc);
    if (kyc.uploads.length >= MAX_UPLOADS)
        return next(new AppError("You've uploaded a lot of files. Remove some you no longer need.", 400));
    const stored = await storeKycFile(req.file, req.user._id.toString());
    // Atomic $push, so parallel uploads all land, and only while still editable.
    let updated = null;
    try {
        updated = await Kyc.findOneAndUpdate({ _id: kyc._id, status: { $in: [...KYC_EDITABLE] } }, { $push: { uploads: stored } }, { new: true });
    }
    finally {
        // Don't leave an orphaned file behind if it couldn't be recorded.
        if (!updated)
            await removeKycFile(stored);
    }
    if (!updated)
        return next(new AppError("Your details can't be changed now.", 409));
    const upload = updated.uploads.find((item) => item.publicId === stored.publicId);
    res.status(201).json({
        status: "success",
        message: "Document uploaded",
        data: documentResponse(upload),
    });
};
// DELETE /kyc/me/documents/:docId: removes the file and empties any field using it.
export const removeMyKycDocument = async (req, res, next) => {
    const { docId } = req.params;
    const kyc = await findMine(req);
    const upload = isValidObjectId(docId)
        ? kyc?.uploads.find((item) => item._id.toString() === docId)
        : undefined;
    if (!kyc || !upload)
        return next(new AppError("Document not found.", 404));
    assertEditable(kyc);
    // Atomic $pull + clearing the fields that used it, so an upload landing at
    // the same moment isn't lost.
    const cleared = Object.fromEntries(documentReferencePaths(kyc, docId).map((path) => [path, null]));
    const result = await Kyc.updateOne({ _id: kyc._id, status: { $in: [...KYC_EDITABLE] } }, {
        $pull: { uploads: { _id: upload._id } },
        ...(Object.keys(cleared).length > 0 && { $set: cleared }),
    });
    if (result.modifiedCount === 0)
        return next(new AppError("Your details can't be changed now.", 409));
    await removeKycFile(upload);
    res.status(200).json({ status: "success", message: "Document removed" });
};
// POST /kyc/me/submit
export const submitMyKyc = async (req, res, next) => {
    const kyc = await findMine(req);
    if (!kyc)
        return next(new AppError("Fill in your business details first.", 400));
    assertEditable(kyc);
    const problems = kycSubmissionProblems(kycForChecks(kyc));
    if (problems.length > 0)
        return res.status(400).json({
            status: "fail",
            message: problems[0].message,
            problems,
        });
    const now = new Date();
    kyc.status = "submitted";
    kyc.submittedAt = now;
    kyc.declarationAcceptedAt = now;
    kyc.reviewNotes = [];
    kyc.rejectionReason = undefined;
    kyc.history.push({ action: "submitted", by: req.user._id, at: now });
    await kyc.save();
    // The submission is saved either way; a failed email is logged, not fatal.
    const user = req.user;
    const [received, staff] = await Promise.all([
        sendKycReceivedEmail(user, kyc.business.legalName),
        sendKycNewSubmissionEmail({
            id: kyc._id.toString(),
            businessName: kyc.business.legalName,
            accountType: kyc.accountType,
            applicantName: user.fullname,
            applicantEmail: user.email,
        }),
    ]);
    if (received.error)
        console.error("[kyc] received email failed:", received.error);
    if (staff.error)
        console.error("[kyc] staff email failed:", staff.error);
    res.status(200).json({
        status: "success",
        message: "Verification submitted. We'll email you when it's reviewed.",
        data: toKycResponse(kyc),
    });
};
// GET /kyc/documents/:docId
// Opens a verification document for its owner or for staff, by redirecting
// to a signed Cloudinary link that expires in a few minutes. No permanent
// URL to these files exists anywhere.
export const openKycDocument = async (req, res, next) => {
    const { docId } = req.params;
    if (!isValidObjectId(docId))
        return next(new AppError("Document not found.", 404));
    const kyc = await Kyc.findOne({ "uploads._id": docId }, { user: 1, uploads: { $elemMatch: { _id: docId } } });
    const upload = kyc?.uploads[0];
    const isOwner = kyc && kyc.user.toString() === req.user._id.toString();
    const isStaff = STAFF_ROLES.includes(req.user.role);
    // Same answer for "missing" and "not yours", so ids can't be probed.
    if (!kyc || !upload || (!isOwner && !isStaff))
        return next(new AppError("Document not found.", 404));
    res.set("Cache-Control", "no-store");
    res.redirect(302, kycFileLink(upload));
};
//# sourceMappingURL=kyc.controller.js.map