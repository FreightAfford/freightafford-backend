import express from "express";
import appConfig from "./app.config.js";
import dbConfig from "./configurations/db.configuration.js";
import envConfig from "./configurations/env.configuration.js";
const app = express();
const port = +envConfig.PORT || 9000;
appConfig(app);
let server;
const startServer = async () => {
    server = app.listen(port, () => {
        console.log(`Server is listening to PORT: ${port}`);
    });
    await dbConfig();
};
startServer();
process.on("uncaughtException", (error) => {
    console.error("uncaughtException:", error.name, error.message);
});
process.on("unhandledRejection", (error) => {
    if (error instanceof Error)
        console.error("unhandledRejection", error.name, error.message);
    server.close(() => process.exit(1));
});
//# sourceMappingURL=server.js.map