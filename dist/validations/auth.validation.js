import { z } from "zod";
export const registerSchema = z.object({
    fullname: z.string().min(2).max(120),
    email: z.email(),
    password: z.string().min(8),
    acceptTerms: z.literal(true),
    acceptedFreightRules: z.literal(true),
});
export const verifyOtpSchema = z.object({
    email: z.email(),
    otp: z.string().length(6),
});
export const resendOtpSchema = z.object({ email: z.email() });
export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
});
export const forgotPasswordSchema = z.object({
    email: z.email(),
});
export const resetPasswordSchema = z.object({
    password: z.string().min(8),
});
//# sourceMappingURL=auth.validation.js.map