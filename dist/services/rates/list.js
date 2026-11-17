import { RATE_CONTAINER_SIZES } from "../../utils/interface.js";
import { escapeRegex, lagosToday, RATE_STATUSES, statusFilter } from "./rules.js";
// The admin lists (rates, rate requests): search, filters, sorting and a
// page, worked out in one database query.
const PORT_FIELDS = [
    "origin.code",
    "origin.city",
    "origin.country",
    "destination.code",
    "destination.city",
    "destination.country",
];
// Every word must appear in one of the fields, e.g. "NGAPP BEANR" or
// "apapa cocoa".
const searchFilter = (search, fields) => {
    const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    return words.map((word) => ({
        $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(word), $options: "i" } })),
    }));
};
const direction = (sort, fallback) => {
    const s = sort || fallback;
    return { key: s.replace(/^-/, ""), dir: (s.startsWith("-") ? -1 : 1) };
};
const paged = async (model, match, sort, page, limit, addFields) => {
    const pipeline = [{ $match: match }];
    if (addFields)
        pipeline.push({ $addFields: addFields });
    pipeline.push(
    // _id last, so pages never repeat or skip a row with an equal value
    { $sort: { ...sort, _id: 1 } }, {
        $facet: {
            data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: "n" }],
        },
    });
    const [result] = await model.aggregate(pipeline);
    return {
        data: result.data,
        total: result.total[0]?.n ?? 0,
    };
};
export const listRatesQuery = (model, q) => {
    const and = searchFilter(q.search ?? "", [...PORT_FIELDS, "commodity"]);
    if (RATE_STATUSES.includes(q.status))
        and.push(statusFilter(q.status, lagosToday()));
    if (q.containerSize)
        and.push({ containerSize: q.containerSize });
    const { key, dir } = direction(q.sort, "-updatedAt");
    const sort = key === "origin"
        ? { "origin.code": dir, "destination.code": dir }
        : key === "containerSize"
            ? { sizeRank: dir }
            : key === "validTo" || key === "validFrom"
                ? { [key]: dir }
                : { updatedAt: dir };
    return paged(model, and.length ? { $and: and } : {}, sort, q.page ?? 1, q.limit ?? 10, {
        sizeRank: { $indexOfArray: [RATE_CONTAINER_SIZES, "$containerSize"] },
    });
};
export const listRequestsQuery = (model, q) => {
    const and = searchFilter(q.search ?? "", [
        ...PORT_FIELDS,
        "commodity.name",
        "customerName",
        "customerCompany",
        "customerEmail",
    ]);
    if (q.status === "open" || q.status === "resolved")
        and.push({ status: q.status });
    const { key, dir } = direction(q.sort, "-createdAt");
    const sort = key === "origin"
        ? { "origin.code": dir, "destination.code": dir }
        : key === "customer"
            ? { customerSort: dir }
            : key === "status"
                ? { status: dir }
                : { createdAt: dir };
    return paged(model, and.length ? { $and: and } : {}, sort, q.page ?? 1, q.limit ?? 10, {
        customerSort: { $toLower: { $ifNull: ["$customerCompany", "$customerName"] } },
    });
};
//# sourceMappingURL=list.js.map