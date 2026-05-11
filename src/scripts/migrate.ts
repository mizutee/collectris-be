import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, closePool } from "../db/pool.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "../db/schema.sql");

try {
  const sql = await readFile(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Migration complete.");
} finally {
  await closePool();
}
