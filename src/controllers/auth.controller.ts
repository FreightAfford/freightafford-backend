import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import envConfig from "../configurations/env.configuration.js";
import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import FreightRequest from "../models/freight.model.js";
import Invoice from "../models/invoice.model.js";
import User from "../models/user.model.js";
import {
  passwordResetEmail,
  resendOTPEmail,
  sendOTPEmail,
} from "../services/auth.email.js";
import ApiFeatures from "../utils/api.features.js";
import type { AuthenticateRequest } from "../utils/interface.js";
import { generateJWT } from "../utils/jwt.js";
import { generateOTP, hashToken } from "../utils/otp.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import {
  formatPhoneNumber,
  normalizePhoneNumber,
} from "../utils/phoneFormat.js";
import { allowedUserFilters } from "../utils/whitelists.js";

const MAX_OTP_ATTEMPTS = 5;
const MAX_RESEND_LIMIT = 3;

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { fullname, email, password, acceptTerms, acceptedFreightRules } =
    req.body;

  if (!acceptTerms || !acceptedFreightRules)
    return next(new AppError("Agreements must be accepted.", 400));

  const existingUser = await User.findOne({ email });
  if (existingUser) return next(new AppError("Email already registered.", 400));

  const hashedPassword = await hashPassword(password);

  const otp = generateOTP();
  const hashedOtp = hashToken(otp);
  const expiryMinutes = 10;

  const otpExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const user = new User({
    fullname,
    email,
    password: hashedPassword,
    otp: hashedOtp,
    otpExpiry,
    acceptedTermsAt: new Date(),
    acceptedFreightRulesAt: new Date(),
  });

  const { error } = await sendOTPEmail(email, fullname, otp, expiryMinutes);

  if (error)
    return next(
      new AppError(
        "Unable to send verification mail! Kindly retry your registration.",
        400,
      ),
    );

  await user.save();

  res.status(201).json({
    status: "success",
    message: "Registration successful. Please verify your email.",
  });
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return next(new AppError("Email and OTP are required!", 400));

  const user = await User.findOne({ email }).select(
    "+otp +otpExpiry +otpAttempts",
  );

  if (!user) return next(new AppError("Invalid verification request.", 400));

  if (!user.otp || !user.otpExpiry)
    return next(new AppError("No OTP request found.", 400));

  if (user.otpAttempts >= MAX_OTP_ATTEMPTS)
    return next(
      new AppError("Too many failed attempts. Request a new OTP", 429),
    );

  if (user.otpExpiry < new Date())
    return next(new AppError("OTP has expired. Request a new one.", 400));

  const hashedOtp = hashToken(otp);

  if (hashedOtp !== user.otp) {
    user.otpAttempts += 1;
    await user.save();
    return next(new AppError("Invalid OTP.", 400));
  }

  user.isEmailVerified = true;
  user.otp = undefined;
  user.otpExpiry = undefined;
  user.otpAttempts = 0;

  await user.save();

  res
    .status(200)
    .json({ status: "success", message: "Email verified successfully." });
};

export const resendOTP = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).select("+otpResendCount");

  if (!user) return next(new AppError("User not found.", 404));

  if (user.isEmailVerified)
    return next(new AppError("Email already verified.", 400));

  if (user.otpResendCount >= MAX_RESEND_LIMIT)
    return next(new AppError("Maximum OTP resend limit reached.", 429));

  const otp = generateOTP();
  const hashedOtp = hashToken(otp);

  const expiryMinutes = 10;

  user.otp = hashedOtp;
  user.otpExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
  user.otpAttempts = 0;
  user.otpResendCount += 1;

  await user.save();

  const { error } = await resendOTPEmail(
    user.email,
    user.fullname,
    otp,
    expiryMinutes,
  );

  if (error)
    return next(
      new AppError(
        "Unable to send verification mail! Kindly retry your registration.",
        400,
      ),
    );

  res
    .status(200)
    .json({ status: "success", message: "OTP sent successfully." });
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new AppError("Email and password are required.", 400));

  const user = await User.findOne({ email }).select("+password");

  if (!user) return next(new AppError("Invalid email or password.", 401));

  const passwordMatch = await comparePassword(password, user.password);

  if (!passwordMatch)
    return next(new AppError("Invalid email or password.", 401));

  if (!user.isEmailVerified)
    return next(
      new AppError("Please verify your email before logging in.", 403),
    );

  const token = generateJWT({ userId: user._id.toString(), role: user.role });

  res.cookie("jwt", token, {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: envConfig.NODE_ENV === "production",
    sameSite: envConfig.NODE_ENV === "production" ? "none" : "strict",
    path: "/",
  });

  res.status(200).json({
    status: "success",
    message: "Login successful",
    role: user.role,
    user,
    token,
  });
};

export const getMe = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const me = req.user!;

  if (me.phoneNumber) me.phoneNumber = formatPhoneNumber(me.phoneNumber);

  if (!me) return next(new AppError("No user", 404));
  res.status(200).json({
    status: "success",
    user: me,
  });
};

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const baseFilter = {};

  const totalAll = await User.countDocuments(baseFilter);

  const countFeatures = new ApiFeatures(User.find(baseFilter), req.query)
    .filter(allowedUserFilters)
    .search(["fullname", "email", "companyName", "phoneNumber", "country"]);

  const total = await countFeatures.query.countDocuments();

  const baseQuery = User.find(baseFilter);

  const features = new ApiFeatures(baseQuery, req.query)
    .filter(allowedUserFilters)
    .search(["fullname", "email", "companyName", "phoneNumber", "country"])
    .sort()
    .limitFields()
    .paginate();

  const users = await features.query;

  res.status(200).json({
    status: "success",
    results: users.length,
    total,
    totalAll,
    page: Number(req.query.page) || 1,
    data: users,
  });
};

export const getSingleUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = req.params;

  const user = await User.findById(userId);

  if (!user) return next(new AppError("User not found", 404));

  const [requestsCounts, bookingsCounts, invoicesCounts] = await Promise.all([
    FreightRequest.countDocuments({ customer: userId }),
    Booking.countDocuments({ customer: userId }),
    Invoice.countDocuments({ customer: userId }),
  ]);

  if (user.phoneNumber) user.phoneNumber = formatPhoneNumber(user.phoneNumber);

  res.status(200).json({
    status: "success",
    data: {
      user,
      requests: requestsCounts,
      bookings: bookingsCounts,
      invoices: invoicesCounts,
    },
  });
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) return next(new AppError("Provide an existing account.", 404));

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiryMinutes = 15;

  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpiry = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await user.save();

  const resetLink = `${envConfig.CLIENT_URL}/reset-password/${resetToken}`;

  const { error } = await passwordResetEmail(
    email,
    user.fullname,
    resetLink,
    expiryMinutes,
  );

  if (error) return next(new AppError("Unable to send reset email.", 500));

  res.status(200).json({
    status: "success",
    message: "If the email exists, a reset link has been sent.",
  });
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    passwordResetToken: hashToken(token as string),
    passwordResetExpiry: { $gt: new Date() },
  }).select("+passwordResetToken +passwordResetExpiry");

  if (!user) return next(new AppError("Invalid or expired reset token", 400));

  user.password = await hashPassword(password);
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;

  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password reset successful. You may now login.",
  });
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: envConfig.NODE_ENV === "production" ? "none" : "strict",
    secure: envConfig.NODE_ENV === "production",
    path: "/",
  });

  res
    .status(200)
    .json({ status: "success", message: "Logged out successfully." });
};

export const updateUserProfile = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { fullname, phoneNumber, country, companyName, companyAddress } =
    req.body;

  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) return next(new AppError("User not found", 404));

  let normalizedPhone = user.phoneNumber;

  if (phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return next(new AppError("Invalid phone number", 400));
    }
    normalizedPhone = normalized;
  }

  const updateData = {
    fullname,
    phoneNumber: normalizedPhone,
    country,
    companyName,
    companyAddress,
  };

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -otp -passwordResetToken");

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: updatedUser,
  });
};

export const updateUserByAdmin = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { userId } = req.params;

  const {
    fullname,
    email,
    status,
    phoneNumber,
    country,
    companyName,
    companyAddress,
  } = req.body;

  const user = await User.findById(userId);
  if (!user) return next(new AppError("User not found", 404));

  let normalizedPhone = user.phoneNumber;

  if (phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return next(new AppError("Invalid phone number", 400));
    }
    normalizedPhone = normalized;
  }

  const updateData: any = {
    fullname,
    phoneNumber: normalizedPhone,
    country,
    companyName,
    companyAddress,
  };

  // Admin-only fields
  if (email) updateData.email = email;
  if (status) updateData.status = status;

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -otp -passwordResetToken");

  res.status(200).json({
    status: "success",
    message: "User updated successfully",
    data: updatedUser,
  });
};

export const changePassword = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!._id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return next(new AppError("All fields are required", 400));

  const user = await User.findById(userId).select("+password");

  if (!user) return next(new AppError("User not found", 404));

  // Check current password
  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) return next(new AppError("Current password is incorrect", 400));

  // Prevent reuse of the same password
  const isSamePassword = await comparePassword(newPassword, user.password);
  if (isSamePassword)
    return next(new AppError("New password must be different", 400));

  const hashedPassword = await hashPassword(newPassword);

  user.password = hashedPassword;
  user.passwordChangedAt = new Date();

  await user.save();

  res
    .status(200)
    .json({ status: "success", message: "Password changed successfully" });
};
