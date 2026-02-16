import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.connect()
  .then(() => console.log("✅ Base de datos conectada"))
  .catch(err => console.error("❌ Error de conexión:", err));

export default pool;
