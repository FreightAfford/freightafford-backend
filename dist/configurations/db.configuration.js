import { connect } from "mongoose";
import envConfig from "./env.configuration.js";
const dbConfig = async () => {
    try {
        const db = await connect(envConfig.MONGO_URI);
        console.log(`Database connected to HOST: ${db.connection.host}`);
    }
    catch (error) {
        if (error instanceof Error)
            console.error("Error", error);
    }
};
export default dbConfig;
//# sourceMappingURL=db.configuration.js.map