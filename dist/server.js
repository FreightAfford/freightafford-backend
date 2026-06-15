import express from "express";
import http from "node:http";
import appConfig from "./app.config.js";
import dbConfig from "./configurations/db.configuration.js";
import envConfig from "./configurations/env.configuration.js";
import { registerCrons } from "./jobs/crons/index.js";
import { initSocketServer } from "./socket.js";
const app = express();
const port = +envConfig.PORT || 9000;
appConfig(app);
let server;
const startServer = async () => {
    server = http.createServer(app);
    server.listen(port, () => {
        console.log(`Server is listening to PORT: ${port}`);
    });
    initSocketServer(server);
    await dbConfig();
};
startServer();
registerCrons();
process.on("uncaughtException", (error) => {
    console.error("uncaughtException:", error.name, error.message);
});
process.on("unhandledRejection", (error) => {
    if (error instanceof Error)
        console.error("unhandledRejection", error.name, error.message);
    server.close(() => process.exit(1));
});
//# sourceMappingURL=server.js.map