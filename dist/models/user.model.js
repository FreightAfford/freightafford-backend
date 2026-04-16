import { model, Schema } from "mongoose";
const userSchema = new Schema({
    fullname: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 120,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        lowercase: true,
        index: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    passwordChangedAt: { type: Date },
    role: {
        type: String,
        enum: ["customer", "admin"],
        default: "customer",
        index: true,
    },
    isEmailVerified: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date },
    otpAttempts: { type: Number, default: 0, select: false },
    otpResendCount: { type: Number, default: 0, select: false },
    acceptedTermsAt: { type: Date },
    acceptedFreightRulesAt: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
    companyName: { type: String, lowercase: true, trim: true },
    phoneNumber: { type: String, trim: true },
    companyAddress: { type: String, lowercase: true, trim: true },
    country: { type: String, trim: true },
    status: {
        type: String,
        enum: ["active", "inactive", "suspended"],
        default: "active",
    },
}, { timestamps: true });
const User = model("User", userSchema);
export default User;
//# sourceMappingURL=user.model.js.map