// Commission customers can use contract rates; premium customers can't.
export const CUSTOMER_TIERS = ["commission", "premium"];
// ---- Contract rates -------------------------------------------------------
// FreightAfford's Maersk contract rates (no Maersk API offers them), kept by
// admin. Plain shapes live in services/rates/rules.ts; these are the stored
// documents.
export const RATE_CONTAINER_SIZES = [
    "20ft Std",
    "40ft Std",
    "40ft HC",
    "45ft HC",
];
//# sourceMappingURL=interface.js.map