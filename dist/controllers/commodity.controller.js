import AppError from "../errors/app.error.js";
import { searchCommodities as searchMaerskCommodities } from "../integrations/maersk/commodities.client.js";
// AUTHENTICATED: Commodity typeahead backed by the Maersk Commodity Classifications API
export const searchCommodities = async (req, res, next) => {
    const q = String(req.query.q ?? "")
        .replace(/[^\p{L}\p{N}\s,'()-]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
    if (q.length < 2)
        return next(new AppError("Enter at least 2 characters to search", 400));
    const data = await searchMaerskCommodities(q.slice(0, 60));
    res.status(200).json({ status: "success", results: data.length, data });
};
//# sourceMappingURL=commodity.controller.js.map