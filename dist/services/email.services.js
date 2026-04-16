import { Resend } from "resend";
import envConfig from "../configurations/env.configuration.js";
export const resend = new Resend(envConfig.RESEND_API_KEY);
//# sourceMappingURL=email.services.js.map