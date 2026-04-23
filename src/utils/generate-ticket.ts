import { Counter } from "../models/counter.model.js";

export const generateTicketId = async () => {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { name: `ticket-${year}` },
    { $inc: { value: 1 } },
    { returnDocument: "after", upsert: true },
  );

  return `FA-${year}-${counter.value}`;
};
