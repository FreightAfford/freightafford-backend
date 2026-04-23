import type { NextFunction, Request, Response } from "express";
import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import {
  sendAdminCustomerDecisionNotification,
  sendAdminFreightRequestNotification,
  sendCustomerAcceptedNotification,
  sendCustomerCounterNotification,
  sendCustomerRejectedNotification,
} from "../services/freight.service.js";
import ApiFeatures from "../utils/api-features.js";
import type { AuthenticateRequest, IUser } from "../utils/interface.js";
import { allowedFreightFilters } from "../utils/whitelists.js";

const generateBookingNumber = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `FA-${new Date().getFullYear()}-${random}`;
};

// CUSTOMER: Create Request
export const createFreightRequest = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const {
    originPort,
    destinationPort,
    commodity,
    cargoReadyDate,
    cargoWeight,
    proposedPrice,
    notes,
    containerSize,
    containerQuantity,
  } = req.body;

  const { error } = await sendAdminFreightRequestNotification({
    originPort,
    destinationPort,
    cargoWeight,
    proposedPrice,
    commodity,
  });

  if (error) {
    return next(
      new AppError("Unable to send freight request notification", 400),
    );
  }

  const request = await FreightRequest.create({
    customer: req.user!._id,
    customerName: req.user!.fullname,
    customerEmail: req.user!.email,
    originPort,
    destinationPort,
    commodity,
    cargoWeight,
    cargoReadyDate,
    proposedPrice,
    notes,
    containerSize,
    containerQuantity,
  });

  res.status(201).json({
    status: "success",
    message: "Freight request sent successfully.",
    data: request,
  });
};

// ADMIN & CSO: Update Request
export const updateFreightRequest = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { requestId } = req.params;

  const {
    originPort,
    destinationPort,
    commodity,
    cargoReadyDate,
    cargoWeight,
    proposedPrice,
    notes,
    containerSize,
    containerQuantity,
    status,
    adminCounterPrice,
    counterReason,
    rejectionReason,
  } = req.body;

  const request = await FreightRequest.findById(requestId);

  if (!request) return next(new AppError("Freight request not found", 404));

  if (["accepted", "rejected", "expired"].includes(request.status))
    return next(new AppError("Cannot update a finalized freight request", 400));

  const updatedData: any = {};

  if (originPort) updatedData.originPort = originPort.toLowerCase();
  if (destinationPort)
    updatedData.destinationPort = destinationPort.toLowerCase();
  if (commodity) updatedData.commodity = commodity.toLowerCase();
  if (cargoReadyDate) updatedData.cargoReadyDate = cargoReadyDate;
  if (cargoWeight) updatedData.cargoWeight = cargoWeight;
  if (proposedPrice) updatedData.proposedPrice = proposedPrice;
  if (notes !== undefined) updatedData.notes = notes;
  if (containerSize) updatedData.containerSize = containerSize;
  if (containerQuantity) updatedData.containerQuantity = containerQuantity;

  if (status) {
    updatedData.status = status;

    if (status === "countered") {
      if (!adminCounterPrice || !counterReason)
        return next(
          new AppError(
            "Counter price and reason are required for counter offers",
            400,
          ),
        );

      updatedData.adminCounterPrice = adminCounterPrice;
      updatedData.counterReason = counterReason;
      updatedData.adminActionAt = new Date();
    }

    if (status === "rejected") {
      if (!rejectionReason)
        return next(new AppError("Rejection reason is required", 400));

      updatedData.rejectionReason = rejectionReason;
      updatedData.adminActionAt = new Date();
    }

    if (status === "accepted") updatedData.adminActionAt = new Date();
  }

  const updatedRequest = await FreightRequest.findByIdAndUpdate(
    requestId,
    updatedData,
    { new: true, runValidators: true },
  );

  res.status(200).json({
    status: "success",
    message: "Freight request updated successfully",
    data: updatedRequest,
  });
};

export const getMyFreightRequest = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const baseFilter = { customer: req.user._id };

  const totalAll = await FreightRequest.countDocuments(baseFilter);

  const countFeatures = new ApiFeatures(
    FreightRequest.find(baseFilter),
    req.query,
  )
    .filter(allowedFreightFilters)
    .search(["originPort", "destinationPort", "commodity", "status"]);

  const total = await countFeatures.query.countDocuments();

  const baseQuery = FreightRequest.find(baseFilter).populate("customer");
  console.log(req.query);
  const features = new ApiFeatures(baseQuery, req.query)
    .filter(allowedFreightFilters)
    .search(["originPort", "destinationPort", "commodity", "status"])
    .sort()
    .limitFields()
    .paginate();

  const requests = await features.query;

  res.status(200).json({
    status: "success",
    results: requests.length,
    total,
    totalAll,
    page: Number(req.query.page) || 1,
    data: requests,
  });
};

export const getAllFreightRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const baseFilter = {};

  const totalAll = await FreightRequest.countDocuments(baseFilter);

  const countFeatures = new ApiFeatures(
    FreightRequest.find(baseFilter),
    req.query,
  )
    .filter(allowedFreightFilters)
    .search([
      "originPort",
      "destinationPort",
      "commodity",
      "status",
      "customerName",
      "customerEmail",
    ]);

  const total = await countFeatures.query.countDocuments();

  const baseQuery = FreightRequest.find(baseFilter).populate(
    "customer",
    "fullname companyName",
  );

  const features = new ApiFeatures(baseQuery, req.query)
    .filter(allowedFreightFilters)
    .search([
      "originPort",
      "destinationPort",
      "commodity",
      "status",
      "customerName",
      "customerEmail",
    ])
    .sort()
    .limitFields()
    .paginate();

  const requests = await features.query;

  res.status(200).json({
    status: "success",
    results: requests.length,
    total,
    totalAll,
    page: Number(req.query.page) || 1,
    data: requests,
  });
};

export const acceptFreightRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const request = await FreightRequest.findById(req.params.id).populate(
    "customer",
    "fullname email",
  );

  if (!request) return next(new AppError("Freight request not found", 404));

  const user = await User.findById(request.customer);

  if (!user) return next(new AppError("User not found.", 404));

  if (request.status !== "pending" && request.status !== "countered")
    return next(new AppError("Request cannot be accepted", 400));

  request.status = "accepted";
  request.adminActionAt = new Date();

  const customer = request.customer as unknown as IUser;

  const booking = await Booking.create({
    bookingNumber: generateBookingNumber(),
    freightRequest: request._id,
    customer: request.customer,
    customerName: customer.fullname,
    customerEmail: customer.email,
  });

  request.booking = booking._id;

  const { error } = await sendCustomerAcceptedNotification(
    user.email,
    user.fullname,
    booking.bookingNumber,
  );

  if (error) {
    return next(
      new AppError(
        "Booking created but notification email failed to send.",
        400,
      ),
    );
  }

  await request.save();

  res.status(200).json({
    status: "success",
    message: "Freight request accepted",
    data: { freightRequest: request, booking },
  });
};

export const counterFreightRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { counterPrice, reason } = req.body;

  if (!counterPrice || !reason)
    return next(
      new AppError("Missing required fields for counter request", 401),
    );

  const request = await FreightRequest.findById(req.params.id);

  if (!request) return next(new AppError("Freight request not found.", 404));

  const user = await User.findById(request.customer);

  if (!user) return next(new AppError("User not found.", 404));

  if (request.status !== "pending")
    return next(new AppError("Request already processed.", 400));

  request.adminCounterPrice = counterPrice;
  request.counterReason = reason;
  request.status = "countered";
  request.adminActionAt = new Date();

  const { error } = await sendCustomerCounterNotification(
    user.email,
    user.fullname,
    counterPrice,
    reason,
  );

  if (error)
    return next(
      new AppError("Unable to send counter freight request notification.", 400),
    );

  await request.save();

  res.status(200).json({
    status: "success",
    message: "Counter offer sent successfully",
    data: request,
  });
};

export const rejectFreightRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { reason } = req.body;

  if (!reason)
    return next(
      new AppError("Missing required fields for rejecting request", 401),
    );

  const request = await FreightRequest.findById(req.params.id);

  if (!request) return next(new AppError("Freight request not found.", 404));

  const user = await User.findById(request.customer);

  if (!user) return next(new AppError("User not found.", 404));

  if (request.status !== "pending" && request.status !== "countered")
    return next(new AppError("Request already processed.", 400));

  request.status = "rejected";
  request.rejectionReason = reason;
  request.adminActionAt = new Date();

  const { error } = await sendCustomerRejectedNotification(
    user.email,
    user.fullname,
    reason,
  );

  if (error)
    return next(
      new AppError("Unable to send reject freight request notification", 400),
    );

  await request.save();

  res.status(200).json({
    status: "success",
    message: "Freight request rejected",
    data: request,
  });
};

export const respondToCounter = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { decision } = req.body;

  const request = await FreightRequest.findById(req.params.id).populate(
    "customer",
    "fullname email",
  );

  if (!request) return next(new AppError("Freight request not found", 404));

  if (request.customer._id.toString() !== req.user._id.toString())
    return next(
      new AppError("You are not allowed to respond to this counter", 403),
    );

  if (request.status !== "countered")
    return next(new AppError("No counter offer to respond to", 400));

  if (decision === "accept") request.status = "accepted";
  else if (decision === "reject") request.status = "rejected";
  else return next(new AppError("Invalid decision", 400));

  request.customerDecisionAt = new Date();

  const customer = request.customer as unknown as IUser;

  const { error } = await sendAdminCustomerDecisionNotification(
    ["freightaffords@gmail.com", "devfranklinandrew@gmail.com"],
    req.user.fullname,
    decision,
  );

  if (error)
    return next(
      new AppError(
        "Unable to send response to counter offer request notification.",
        400,
      ),
    );

  const booking = await Booking.create({
    bookingNumber: generateBookingNumber(),
    freightRequest: request._id,
    customer: request.customer,
    customerName: customer.fullname,
    customerEmail: customer.email,
  });

  request.booking = booking._id;

  await request.save();

  res.status(200).json({
    status: "success",
    message: "Response submitted successfully. Go to Bookings to see details.",
    data: request,
  });
};

export const getFreightRequest = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;

  const request = await FreightRequest.findById(id).populate(
    "customer",
    "fullname companyName",
  );

  if (!request) return next(new AppError("Freight Request not found", 404));

  if (
    req.user!.role === "customer" &&
    request.customer._id.toString() !== req.user!._id.toString()
  )
    return next(
      new AppError("You are not authorized to access this request", 403),
    );

  res.status(200).json({ status: "success", data: request });
};
