const { Sequelize } = require("sequelize");
import { log } from "./init";
const CONFIG = require("./config").default;
//import CONFIG from "./config";
const sequelize = {
  db: new Sequelize(CONFIG.pg.db, CONFIG.pg.user, CONFIG.pg.pass, {
    host: CONFIG.pg.host,
    dialect: "postgres",
    port: CONFIG.pg.port,
    logging: false,
  }),
  async test() {
    try {
      await this.db.authenticate();
      console.log({
        info: "Postgres Connection has been established successfully.",
      });
    } catch (error) {
      console.error({ error: "Unable to connect to the database: " + error });
      throw error;
    }
  },
};
sequelize.test();

export default sequelize;
