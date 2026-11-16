import { Schema, model } from "mongoose";
import type { IImportMapping } from "../utils/interface.js";
import { portSchema } from "./rate.model.js";

// What admin chose for a port or commodity name a rates import used and the
// searches couldn't match, e.g. Maersk's quote code MINE_IRO_ORE_OTH_MET →
// "Iron ore" (002701). The next import with that name matches on its own.

const importMappingSchema = new Schema<IImportMapping>(
  {
    kind: { type: String, enum: ["port", "commodity"], required: true },
    // Ports: the name as the file wrote it, lower-cased with single spaces.
    // Commodities: "maersk:CODE" or "text:name".
    key: { type: String, required: true, trim: true },
    port: { type: portSchema },
    commodity: {
      type: new Schema(
        {
          code: { type: String, required: true, trim: true },
          name: { type: String, required: true, trim: true },
        },
        { _id: false },
      ),
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

importMappingSchema.index({ kind: 1, key: 1 }, { unique: true });

const ImportMapping = model<IImportMapping>(
  "ImportMapping",
  importMappingSchema,
);

export default ImportMapping;
