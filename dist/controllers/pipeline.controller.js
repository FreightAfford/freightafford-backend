import BillOfLading from "../models/bl.model.js";
import Booking from "../models/booking.model.js";
import FreightRequest from "../models/freight.model.js";
import Invoice from "../models/invoice.model.js";
import User from "../models/user.model.js";
export const getAdminOverview = async (req, res, next) => {
    const [totalUsers, totalRequests, pendingRequests, totalBookings, invoiceStats,] = await Promise.all([
        User.countDocuments(),
        FreightRequest.countDocuments(),
        FreightRequest.countDocuments({ status: "pending" }),
        Booking.countDocuments(),
        Invoice.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                },
            },
        ]),
    ]);
    res.status(200).json({
        status: "success",
        data: {
            totalUsers,
            totalRequests,
            pendingRequests,
            totalBookings,
            totalInvoiceAmount: invoiceStats[0]?.totalAmount || 0,
        },
    });
};
export const getCustomerOverview = async (req, res, next) => {
    const userId = req.user._id;
    const [totalRequests, totalBookings, bills, invoiceStats] = await Promise.all([
        FreightRequest.countDocuments({ customer: userId }),
        Booking.countDocuments({ customer: userId }),
        BillOfLading.countDocuments({ customer: userId }),
        Invoice.aggregate([
            {
                $match: {
                    customer: userId,
                    status: { $in: ["pending", "awaiting_verification"] },
                },
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                },
            },
        ]),
    ]);
    console.log(invoiceStats);
    res.status(200).json({
        status: "success",
        data: {
            totalRequests,
            totalBookings,
            bills,
            totalInvoiceAmount: invoiceStats[0]?.totalAmount || 0,
        },
    });
};
//# sourceMappingURL=pipeline.controller.js.map