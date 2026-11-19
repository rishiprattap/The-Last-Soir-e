import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Attach a Postgres database before starting.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(3644281)");
    await client.query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log("Ticket database schema is ready.");
} catch {
  console.error("Could not prepare the ticket database. Check the Postgres connection.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
