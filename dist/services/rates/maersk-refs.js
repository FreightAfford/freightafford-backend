import AppError from "../../errors/app.error.js";
import { getCommodityByCode } from "../../integrations/maersk/commodities.client.js";
import { getLocationByCode } from "../../integrations/maersk/locations.client.js";
// Ports and commodities come from the Maersk searches. The server looks the
// codes up again (both lookups are cached), so names are never what the
// client says they are, and an unknown code is refused.
export const resolveRatePort = async (port, label) => {
    const location = await getLocationByCode(port.code);
    if (!location)
        throw new AppError(`${label} port "${port.code}" isn't a recognised port`, 400);
    return { code: location.code, city: location.city, country: location.country };
};
export const resolveRateCommodity = async (commodity) => {
    const found = await getCommodityByCode(commodity.code);
    if (!found)
        throw new AppError(`Commodity "${commodity.code}" isn't a recognised commodity`, 400);
    return { code: found.code, name: found.name };
};
//# sourceMappingURL=maersk-refs.js.map