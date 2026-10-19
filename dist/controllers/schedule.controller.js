import AppError from "../errors/app.error.js";
import { UN_LOCODE_REGEX } from "../integrations/maersk/locations.client.js";
import { CONTAINER_CODES, DEFAULT_CONTAINER, getActivePorts as getMaerskActivePorts, getPortSchedule as getMaerskPortSchedule, getRoutes as getMaerskRoutes, ROUTE_PAST_DAYS, } from "../integrations/maersk/schedules.client.js";
const DAY = 24 * 60 * 60 * 1000;
const DAY_OPTIONS = [3, 7, 10, 14];
// Maersk serves port schedules from 90 days back to 180 days ahead
const MAX_DAYS_BACK = 90;
const MAX_DAYS_AHEAD = 180;
const today = () => new Date().toISOString().slice(0, 10);
// AUTHENTICATED: every port Maersk calls at, for the country and port pickers
export const getActivePorts = async (_req, res) => {
    const data = await getMaerskActivePorts();
    res.status(200).json({ status: "success", results: data.length, data });
};
// AUTHENTICATED: vessel calls at one port, e.g.
// /schedules/ports?port=NGAPP&from=2026-10-19&days=7
export const getPortSchedule = async (req, res, next) => {
    const port = String(req.query.port ?? "").trim().toUpperCase();
    if (!UN_LOCODE_REGEX.test(port))
        return next(new AppError("Choose a port to see its schedule", 400));
    const from = String(req.query.from ?? "").trim() || today();
    const fromTime = Date.parse(`${from}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(fromTime))
        return next(new AppError("Enter the date as YYYY-MM-DD", 400));
    const offsetDays = (fromTime - Date.parse(`${today()}T00:00:00Z`)) / DAY;
    if (offsetDays < -MAX_DAYS_BACK || offsetDays > MAX_DAYS_AHEAD)
        return next(new AppError("Pick a date within 90 days before or 180 days after today", 400));
    const days = req.query.days === undefined ? 7 : Number(req.query.days);
    if (!DAY_OPTIONS.includes(days))
        return next(new AppError("Days must be 3, 7, 10 or 14", 400));
    const data = await getMaerskPortSchedule(port, from, days);
    res.status(200).json({ status: "success", data });
};
// AUTHENTICATED: every Maersk route between two ports, e.g.
// /schedules/routes?origin=CNSHA&destination=NGAPP&by=departing&date=2026-10-20&container=45G1
export const getRoutes = async (req, res, next) => {
    const origin = String(req.query.origin ?? "").trim().toUpperCase();
    const destination = String(req.query.destination ?? "")
        .trim()
        .toUpperCase();
    if (!UN_LOCODE_REGEX.test(origin) || !UN_LOCODE_REGEX.test(destination))
        return next(new AppError("Choose a From and a To port", 400));
    if (origin === destination)
        return next(new AppError("Choose two different ports", 400));
    const by = req.query.by === "arriving" ? "arriving" : "departing";
    const date = String(req.query.date ?? "").trim() || today();
    const dateTime = Date.parse(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dateTime))
        return next(new AppError("Enter the date as YYYY-MM-DD", 400));
    // Maersk lists departures from a week back; an arrival date in the past
    // has nothing left to book
    const offsetDays = (dateTime - Date.parse(`${today()}T00:00:00Z`)) / DAY;
    const earliest = by === "arriving" ? 0 : -ROUTE_PAST_DAYS;
    if (offsetDays < earliest || offsetDays > MAX_DAYS_AHEAD)
        return next(new AppError(by === "arriving"
            ? "Pick an arrival date from today up to 180 days ahead"
            : "Pick a departure date within 7 days before or 180 days after today", 400));
    const container = String(req.query.container ?? "").trim() || DEFAULT_CONTAINER;
    if (!CONTAINER_CODES.includes(container))
        return next(new AppError("Choose one of the listed container types", 400));
    const data = await getMaerskRoutes(origin, destination, by, date, container);
    res.status(200).json({ status: "success", results: data.routes.length, data });
};
//# sourceMappingURL=schedule.controller.js.map