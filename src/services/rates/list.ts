import type { Model, PipelineStage } from "mongoose";
import { RATE_CONTAINER_SIZES } from "../../utils/interface.js";
import { escapeRegex, lagosToday, RATE_STATUSES, statusFilter, type RateStatus } from "./rules.js";

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
const searchFilter = (search: string, fields: string[]) => {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map((word) => ({
    $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(word), $options: "i" } })),
  }));
};

const direction = (sort: string | undefined, fallback: string) => {
  const s = sort || fallback;
  return { key: s.replace(/^-/, ""), dir: (s.startsWith("-") ? -1 : 1) as 1 | -1 };
};

const paged = async <T>(
  model: Model<T>,
  match: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  page: number,
  limit: number,
  addFields?: Record<string, unknown>,
) => {
  const pipeline: PipelineStage[] = [{ $match: match }];
  if (addFields) pipeline.push({ $addFields: addFields });
  pipeline.push(
    // _id last, so pages never repeat or skip a row with an equal value
    { $sort: { ...sort, _id: 1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  );
  const [result] = await model.aggregate(pipeline);
  return {
    data: result.data as (T & { _id: unknown })[],
    total: (result.total[0]?.n as number) ?? 0,
  };
};

type ListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string;
  containerSize?: string;
};

export const listRatesQuery = <T>(model: Model<T>, q: ListQuery) => {
  const and: Record<string, unknown>[] = searchFilter(q.search ?? "", [...PORT_FIELDS, "commodity"]);
  if (RATE_STATUSES.includes(q.status as RateStatus))
    and.push(statusFilter(q.status as RateStatus, lagosToday()));
  if (q.containerSize) and.push({ containerSize: q.containerSize });

  const { key, dir } = direction(q.sort, "-updatedAt");
  const sort: Record<string, 1 | -1> =
    key === "origin"
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

export const listRequestsQuery = <T>(model: Model<T>, q: ListQuery) => {
  const and: Record<string, unknown>[] = searchFilter(q.search ?? "", [
    ...PORT_FIELDS,
    "commodity.name",
    "customerName",
    "customerCompany",
    "customerEmail",
  ]);
  if (q.status === "open" || q.status === "resolved") and.push({ status: q.status });

  const { key, dir } = direction(q.sort, "-createdAt");
  const sort: Record<string, 1 | -1> =
    key === "origin"
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
