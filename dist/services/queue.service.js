import ChatSession from "../models/chat-session.model.js";
const QueueService = {
    assignPosition: async (sessionId) => {
        const session = await ChatSession.findById(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
        const position = await ChatSession.countDocuments({
            status: "waiting",
            createdAt: { $lt: session.createdAt },
        });
        const queuePosition = position + 1;
        session.queuePosition = queuePosition;
        await session.save();
        return queuePosition;
    },
    recalculateQueue: async () => {
        const waitingSessions = await ChatSession.find({ status: "waiting" }, { _id: 1, customer: 1, createdAt: 1 }).sort({ createdAt: 1 });
        const bulkOps = waitingSessions.map((session, index) => ({
            updateOne: {
                filter: { _id: session._id },
                update: { $set: { queuePosition: index + 1 } },
            },
        }));
        if (bulkOps.length > 0)
            await ChatSession.bulkWrite(bulkOps);
        return waitingSessions.map((session, index) => ({
            sessionId: session._id.toString(),
            customerId: session.customer.toString(),
            queuePosition: index + 1,
        }));
    },
    getQueue: async () => {
        const waitingSessions = await ChatSession.find({ status: "waiting" }, { _id: 1, customer: 1, queuePosition: 1 })
            .sort({ queuePosition: 1 })
            .populate("customer", "fullname email");
        return waitingSessions.map((session) => ({
            sessionId: session._id.toString(),
            customerId: session.customer.toString(),
            queuePosition: session.queuePosition,
        }));
    },
    getPositionForSession: async (sessionId) => {
        const session = await ChatSession.findById(sessionId, {
            status: 1,
            queuePosition: 1,
        });
        if (!session || session.status !== "waiting")
            return null;
        return session.queuePosition;
    },
};
export default QueueService;
//# sourceMappingURL=queue.service.js.map