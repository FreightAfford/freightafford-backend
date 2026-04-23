import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import envConfig from "./configurations/env.configuration.js";
import AppError from "./errors/app.error.js";
import globalErrorHandler from "./errors/global.error.js";
import amendmentRouter from "./routers/amendment.router.js";
import authRouter from "./routers/auth.router.js";
import BLRouter from "./routers/bl.router.js";
import bookingRouter from "./routers/booking.router.js";
import freightRouter from "./routers/freight.router.js";
import invoiceRouter from "./routers/invoice.router.js";
import pipelineRouter from "./routers/pipeline.router.js";
import ticketRouter from "./routers/ticket.router.js";
import trackingRouter from "./routers/tracking.router.js";
import webhookRouter from "./routers/webhook.router.js";

const appConfig = (app: Application) => {
  app
    .use(
      cors({
        credentials: true,
        origin: ["http://localhost:5173", "https://freightafford.com"],
      }),
    )
    .use(helmet())
    .use(express.json())
    .use(cookieParser());

  if (envConfig.NODE_ENV === "development") app.use(morgan("dev"));

  app.get("/", (req: Request, res: Response) =>
    res.status(200).json({ message: "Freight Afford Server and API is live!" }),
  );

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/freight-request", freightRouter);
  app.use("/api/v1/booking", bookingRouter);
  app.use("/api/v1/tracking", trackingRouter);
  app.use("/api/v1/bl", BLRouter);
  app.use("/api/v1/invoice", invoiceRouter);
  app.use("/api/v1/pipeline", pipelineRouter);
  app.use("/api/v1/amendment", amendmentRouter);
  app.use("/api/v1/tickets", ticketRouter);
  app.use("/api/webhook", webhookRouter);

  app.use((req, res, next) =>
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404)),
  );

  app.use(globalErrorHandler);
};

export default appConfig;
