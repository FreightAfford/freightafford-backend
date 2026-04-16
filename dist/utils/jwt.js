import jwt from "jsonwebtoken";
import envConfig from "../configurations/env.configuration.js";
export const generateJWT = (payload) => {
    if (!envConfig.JWT_SECRET)
        throw new Error("JWT_SECRET not defined");
    return jwt.sign(payload, envConfig.JWT_SECRET, { expiresIn: "1d" });
};
export const verifyJWT = (token) => {
    if (!envConfig.JWT_SECRET)
        throw new Error("JWT_SECRET not defined");
    return jwt.verify(token, envConfig.JWT_SECRET);
};
//# sourceMappingURL=jwt.js.map