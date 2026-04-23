import { Schema, model } from "mongoose";

const counterSchema = new Schema({
  name: { type: String, unique: true, required: true },
  value: { type: Number, default: 1000 },
});

export const Counter = model("Counter", counterSchema);
