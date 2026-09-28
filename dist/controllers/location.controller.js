import AppError from "../errors/app.error.js";
import { searchLocations as searchMaerskLocations } from "../integrations/maersk/locations.client.js";
// AUTHENTICATED: Port/city typeahead backed by the Maersk Locations API
export const searchLocations = async (req, res, next) => {
    const q = String(req.query.q ?? "")
        .replace(/[^\p{L}\s'-]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
    if (q.length < 2)
        return next(new AppError("Enter at least 2 letters to search", 400));
    const data = await searchMaerskLocations(q.slice(0, 60));
    res.status(200).json({ status: "success", results: data.length, data });
};
//# sourceMappingURL=location.controller.js.map