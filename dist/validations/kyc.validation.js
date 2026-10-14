import { z } from "zod";
// Business verification (KYC) rules. These mirror the frontend's
// validations/kycValidation.ts so customers see the same messages, but the
// server is the one that decides.
// ---- Drafts: loose shapes, since steps are saved half-finished ----
// A document field arrives as the frontend's document object, its id, or null.
const draftDocument = z
    .union([z.object({ id: z.string() }).passthrough(), z.string(), z.null()])
    .optional()
    .transform((value) => value === undefined ? undefined : value === null ? null : typeof value === "string" ? value : value.id);
const draftText = (max = 200) => z.string().trim().max(max).optional();
const draftDate = z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"), z.literal(""), z.null()])
    .optional();
export const kycDraftSchema = z
    .object({
    accountType: z.enum(["export_agent", "exporter"]).optional(),
    business: z
        .object({
        legalName: draftText(),
        cacType: z.enum(["RC", "BN"]).optional(),
        cacNumber: draftText(20),
        cacCertificate: draftDocument,
        tin: draftText(20),
        tinCertificate: draftDocument,
        nepcNumber: draftText(60),
        nepcExpiry: draftDate,
        nepcCertificate: draftDocument,
        address: z
            .object({
            street: draftText(250),
            city: draftText(100),
            state: draftText(60),
            proofOfAddress: draftDocument,
        })
            .partial()
            .optional(),
    })
        .partial()
        .optional(),
    directors: z
        .array(z.object({
        id: z.string().optional(),
        fullName: draftText(),
        role: draftText(100),
        idType: z.enum(["nin", "passport", "drivers_licence"]).optional(),
        idNumber: draftText(30),
        idExpiry: draftDate,
        idDocument: draftDocument,
    }))
        .max(10, "Add up to 10 directors")
        .optional(),
    authorisation: z
        .object({
        letter: draftDocument,
        signedBy: draftText(),
        issuedOn: draftDate,
    })
        .partial()
        .optional(),
})
    .strict();
const strip = (value) => value.replace(/[\s-]/g, "").toUpperCase();
export const normaliseCacNumber = (value) => strip(value).replace(/^(RC|BN)/, "");
const isCacNumber = (value) => /^\d{4,8}$/.test(normaliseCacNumber(value));
const isTin = (value) => /^\d{8}-?\d{4}$/.test(value.trim()) || /^\d{10}$/.test(strip(value));
const startOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};
/** Every reason the application can't be submitted yet, field by field. */
export const kycSubmissionProblems = (kyc) => {
    const problems = [];
    const need = (ok, path, message) => {
        if (!ok)
            problems.push({ path, message });
    };
    const { business, directors, authorisation } = kyc;
    const today = startOfToday();
    need(business.legalName.length >= 2, "business.legalName", "Enter the name exactly as it is on the CAC certificate");
    need(business.cacNumber, "business.cacNumber", "Enter the CAC registration number");
    if (business.cacNumber)
        need(isCacNumber(business.cacNumber), "business.cacNumber", "Enter the number on the CAC certificate, e.g. RC 1234567");
    need(business.cacCertificate, "business.cacCertificate", "Upload the CAC certificate");
    // TIN is optional; if given it must be valid and come with its certificate.
    if (business.tin) {
        need(isTin(business.tin), "business.tin", "Enter a TIN like 12345678-0001, or a 10-digit JTB TIN");
        need(business.tinCertificate, "business.tinCertificate", "Upload the TIN certificate, or clear the TIN");
    }
    need(business.nepcNumber, "business.nepcNumber", "Enter the NEPC registration number");
    need(business.nepcExpiry, "business.nepcExpiry", "Enter the NEPC certificate's expiry date");
    if (business.nepcExpiry)
        need(business.nepcExpiry > today, "business.nepcExpiry", "The NEPC certificate has expired. Upload a current one.");
    need(business.nepcCertificate, "business.nepcCertificate", "Upload the NEPC certificate");
    need(business.address.street.length >= 5, "business.address.street", "Enter the street address");
    need(business.address.city.length >= 2, "business.address.city", "Enter the city or town");
    need(business.address.state, "business.address.state", "Choose a state");
    need(business.address.proofOfAddress, "business.address.proofOfAddress", "Upload a recent utility bill");
    need(directors.length > 0, "directors", "Add at least one director or owner");
    directors.forEach((director, index) => {
        const at = (field) => `directors.${index}.${field}`;
        const number = director.idNumber.replace(/\s/g, "").toUpperCase();
        need(director.fullName.length >= 2, at("fullName"), "Enter their full name, as on their ID");
        need(director.role.length >= 2, at("role"), "Enter their role, e.g. Managing Director");
        need(number, at("idNumber"), "Enter the ID number");
        if (number && director.idType === "nin")
            need(/^\d{11}$/.test(number), at("idNumber"), "A NIN is 11 digits");
        if (number && director.idType === "passport")
            need(/^[A-Z]\d{8}$/.test(number), at("idNumber"), "A Nigerian passport number is a letter and 8 digits, e.g. A12345678");
        // NIN slips don't expire; passports and licences do.
        if (director.idType !== "nin") {
            need(director.idExpiry, at("idExpiry"), "Enter the ID's expiry date");
            if (director.idExpiry)
                need(director.idExpiry > today, at("idExpiry"), "This ID has expired. Use a current one.");
        }
        need(director.idDocument, at("idDocument"), "Upload a copy of the ID");
    });
    need(authorisation.letter, "authorisation.letter", "Upload the letter of authority");
    need(authorisation.signedBy, "authorisation.signedBy", "Choose the director who signed it");
    if (authorisation.signedBy)
        need(directors.some((director) => director.fullName === authorisation.signedBy), "authorisation.signedBy", "The letter must be signed by one of the directors you added");
    need(authorisation.issuedOn, "authorisation.issuedOn", "Enter the date on the letter");
    if (authorisation.issuedOn)
        need(authorisation.issuedOn <= new Date(), "authorisation.issuedOn", "The date on the letter can't be in the future");
    return problems;
};
// ---- Staff review ----
// The fields a reviewer can flag; the same paths the frontend uses.
const BUSINESS_FIELDS = {
    legalName: "Registered business name",
    cacNumber: "CAC number",
    cacCertificate: "CAC certificate",
    tin: "TIN",
    tinCertificate: "TIN certificate",
    nepcNumber: "NEPC number",
    nepcExpiry: "NEPC expiry date",
    nepcCertificate: "NEPC certificate",
    address: "Business address",
    "address.proofOfAddress": "Proof of address",
};
const DIRECTOR_FIELDS = {
    fullName: "name",
    role: "role",
    idNumber: "ID number",
    idExpiry: "ID expiry date",
    idDocument: "ID copy",
};
const AUTHORISATION_FIELDS = {
    signedBy: "Letter signer",
    issuedOn: "Date on the letter",
    letter: "Letter of authority",
};
/** Plain name for a flagged field, e.g. "Proof of address". */
export const kycFieldLabel = (path, directorNames = []) => {
    const [section, ...rest] = path.split(".");
    if (section === "business")
        return BUSINESS_FIELDS[rest.join(".")];
    if (section === "authorisation")
        return AUTHORISATION_FIELDS[rest.join(".")];
    if (section === "directors" && rest.length === 2) {
        const [index, field] = rest;
        const label = DIRECTOR_FIELDS[field];
        if (!/^\d+$/.test(index) || !label)
            return undefined;
        const name = directorNames[Number(index)] || `Director ${Number(index) + 1}`;
        return `${name}'s ${label}`;
    }
    return undefined;
};
export const kycReviewSchema = z.discriminatedUnion("decision", [
    z.object({ decision: z.literal("approve") }).strict(),
    z
        .object({
        decision: z.literal("changes"),
        notes: z
            .record(z.string(), z.string().trim().min(1, "Add a note to every flagged field").max(1000))
            .refine((notes) => Object.keys(notes).length > 0, "Flag at least one field")
            .refine((notes) => Object.keys(notes).length <= 50, "Flag up to 50 fields")
            .refine((notes) => Object.keys(notes).every((path) => kycFieldLabel(path) !== undefined), "One of the flagged fields isn't recognised"),
    })
        .strict(),
    z
        .object({
        decision: z.literal("reject"),
        reason: z.string().trim().min(5, "Give the business a reason").max(1000),
    })
        .strict(),
]);
//# sourceMappingURL=kyc.validation.js.map