import bcrypt from "bcrypt";
const SALT_ROUNDS = 12;
export const hashPassword = async (plainPassword) => bcrypt.hash(plainPassword, SALT_ROUNDS);
export const comparePassword = async (plainPassword, hashedPassword) => bcrypt.compare(plainPassword, hashedPassword);
//# sourceMappingURL=password.js.map