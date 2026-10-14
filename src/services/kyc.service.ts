import { Types } from "mongoose";
import AppError from "../errors/app.error.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import type {
  IKyc,
  IKycDirector,
  IKycUpload,
  IUser,
  KycAccountType,
} from "../utils/interface.js";
import {
  normaliseCacNumber,
  type KycDraftInput,
  type KycForChecks,
} from "../validations/kyc.validation.js";

// Translates between the stored KYC record and the shape the frontend uses
// (frontend/src/types/kyc.ts): documents as objects, dates as YYYY-MM-DD,
// ID numbers decrypted. Only send these responses to the owner or staff.

type DocumentRef = Types.ObjectId | null;

const day = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : "";

const parseDay = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

const readIdNumber = (director: IKycDirector) => {
  if (!director.idNumberEncrypted) return "";
  try {
    return decrypt(director.idNumberEncrypted);
  } catch (error) {
    console.error("[kyc] couldn't decrypt an ID number:", director._id);
    return "";
  }
};

export const documentResponse = (upload: IKycUpload) => ({
  id: upload._id.toString(),
  name: upload.name,
  size: upload.size,
  mimeType: upload.mimeType,
  uploadedAt: upload.uploadedAt.toISOString(),
});

export const toKycResponse = (kyc: IKyc) => {
  const uploads = new Map(kyc.uploads.map((upload) => [upload._id.toString(), upload]));
  const doc = (ref: DocumentRef) => {
    const upload = ref ? uploads.get(ref.toString()) : undefined;
    return upload ? documentResponse(upload) : null;
  };
  const { business, authorisation } = kyc;

  return {
    id: kyc._id.toString(),
    status: kyc.status,
    accountType: kyc.accountType,
    business: {
      legalName: business.legalName,
      cacType: business.cacType,
      cacNumber: business.cacNumber,
      cacCertificate: doc(business.cacCertificate),
      tin: business.tin,
      tinCertificate: doc(business.tinCertificate),
      nepcNumber: business.nepcNumber,
      nepcExpiry: day(business.nepcExpiry),
      nepcCertificate: doc(business.nepcCertificate),
      address: {
        street: business.address.street,
        city: business.address.city,
        state: business.address.state,
        proofOfAddress: doc(business.address.proofOfAddress),
      },
    },
    directors: kyc.directors.map((director) => ({
      id: director._id.toString(),
      fullName: director.fullName,
      role: director.role,
      idType: director.idType,
      idNumber: readIdNumber(director),
      idExpiry: day(director.idExpiry),
      idDocument: doc(director.idDocument),
    })),
    authorisation: {
      letter: doc(authorisation.letter),
      signedBy: authorisation.signedBy,
      issuedOn: day(authorisation.issuedOn),
    },
    reviewNotes: Object.fromEntries(
      (kyc.reviewNotes ?? []).map(({ path, note }) => [path, note]),
    ),
    rejectionReason: kyc.rejectionReason,
    declarationAcceptedAt: kyc.declarationAcceptedAt?.toISOString(),
    submittedAt: kyc.submittedAt?.toISOString(),
    reviewedAt: kyc.reviewedAt?.toISOString(),
    updatedAt: kyc.updatedAt.toISOString(),
  };
};

/** What a customer who hasn't started sees. Nothing is saved. */
export const emptyKycResponse = (user: IUser) => ({
  id: null,
  status: "not_started" as const,
  accountType: (user.accountType ?? "export_agent") as KycAccountType,
  business: {
    legalName: "",
    cacType: "RC" as const,
    cacNumber: "",
    cacCertificate: null,
    tin: "",
    tinCertificate: null,
    nepcNumber: "",
    nepcExpiry: "",
    nepcCertificate: null,
    address: { street: "", city: "", state: "", proofOfAddress: null },
  },
  directors: [],
  authorisation: { letter: null, signedBy: "", issuedOn: "" },
  reviewNotes: {},
  updatedAt: new Date().toISOString(),
});

/** Statuses in which the customer may still change their details. */
export const KYC_EDITABLE = ["draft", "changes_requested"] as const;

export const assertEditable = (kyc: IKyc | null) => {
  if (!kyc || (KYC_EDITABLE as readonly string[]).includes(kyc.status)) return;
  const messages: Record<string, string> = {
    submitted: "Your details are being reviewed and can't be changed.",
    in_review: "Your details are being reviewed and can't be changed.",
    approved: "Your business is already verified.",
    rejected: "This verification was closed. Contact our team to start again.",
  };
  throw new AppError(messages[kyc.status] ?? "Your details can't be changed now.", 409);
};

/** Applies a saved step to the record. Document ids must be this record's own uploads. */
export const applyKycDraft = (kyc: IKyc, draft: KycDraftInput) => {
  const owned = new Set(kyc.uploads.map((upload) => upload._id.toString()));
  const ref = (id: string | null | undefined, current: DocumentRef): DocumentRef => {
    if (id === undefined) return current;
    if (id === null) return null;
    if (!owned.has(id))
      throw new AppError("One of the documents wasn't found. Upload it again.", 400);
    return new Types.ObjectId(id);
  };

  if (draft.accountType) kyc.accountType = draft.accountType;

  if (draft.business) {
    const next = draft.business;
    const business = kyc.business;
    if (next.legalName !== undefined) business.legalName = next.legalName;
    if (next.cacType !== undefined) business.cacType = next.cacType;
    if (next.cacNumber !== undefined) business.cacNumber = normaliseCacNumber(next.cacNumber);
    business.cacCertificate = ref(next.cacCertificate, business.cacCertificate);
    if (next.tin !== undefined) business.tin = next.tin;
    business.tinCertificate = ref(next.tinCertificate, business.tinCertificate);
    if (next.nepcNumber !== undefined) business.nepcNumber = next.nepcNumber;
    if (next.nepcExpiry !== undefined) business.nepcExpiry = parseDay(next.nepcExpiry);
    business.nepcCertificate = ref(next.nepcCertificate, business.nepcCertificate);
    if (next.address) {
      const address = business.address;
      if (next.address.street !== undefined) address.street = next.address.street;
      if (next.address.city !== undefined) address.city = next.address.city;
      if (next.address.state !== undefined) address.state = next.address.state;
      address.proofOfAddress = ref(next.address.proofOfAddress, address.proofOfAddress);
    }
  }

  if (draft.directors) {
    // Keep each director's id when it's one we issued; the browser makes up
    // ids for new rows.
    const existing = new Map(kyc.directors.map((director) => [director._id.toString(), director]));
    kyc.directors = draft.directors.map((next) => {
      const before = next.id ? existing.get(next.id) : undefined;
      return {
        _id: before?._id ?? new Types.ObjectId(),
        fullName: next.fullName ?? before?.fullName ?? "",
        role: next.role ?? before?.role ?? "",
        idType: next.idType ?? before?.idType ?? "nin",
        idNumberEncrypted:
          next.idNumber === undefined
            ? (before?.idNumberEncrypted ?? "")
            : next.idNumber
              ? encrypt(next.idNumber.replace(/\s/g, "").toUpperCase())
              : "",
        idExpiry: next.idExpiry === undefined ? (before?.idExpiry ?? null) : parseDay(next.idExpiry),
        idDocument: ref(next.idDocument, before?.idDocument ?? null),
      };
    }) as IKycDirector[];
  }

  if (draft.authorisation) {
    const next = draft.authorisation;
    const authorisation = kyc.authorisation;
    authorisation.letter = ref(next.letter, authorisation.letter);
    if (next.signedBy !== undefined) authorisation.signedBy = next.signedBy;
    if (next.issuedOn !== undefined) authorisation.issuedOn = parseDay(next.issuedOn);
  }
};

/** The record in the plain form the submission checks expect. */
export const kycForChecks = (kyc: IKyc): KycForChecks => ({
  business: kyc.business,
  directors: kyc.directors.map((director) => ({
    fullName: director.fullName,
    role: director.role,
    idType: director.idType,
    idNumber: readIdNumber(director),
    idExpiry: director.idExpiry,
    idDocument: director.idDocument,
  })),
  authorisation: kyc.authorisation,
});

/** Paths of every field pointing at this upload, e.g. ["business.cacCertificate"]. */
export const documentReferencePaths = (kyc: IKyc, uploadId: string) => {
  const same = (ref: DocumentRef) => ref?.toString() === uploadId;
  const { business, authorisation } = kyc;
  const paths: string[] = [];
  if (same(business.cacCertificate)) paths.push("business.cacCertificate");
  if (same(business.tinCertificate)) paths.push("business.tinCertificate");
  if (same(business.nepcCertificate)) paths.push("business.nepcCertificate");
  if (same(business.address.proofOfAddress)) paths.push("business.address.proofOfAddress");
  kyc.directors.forEach((director, index) => {
    if (same(director.idDocument)) paths.push(`directors.${index}.idDocument`);
  });
  if (same(authorisation.letter)) paths.push("authorisation.letter");
  return paths;
};
