import { Pool } from "pg";
import type { PoolClient } from "pg";

let pool: Pool | undefined;

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function withPassCapacity<T>(action: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    // Capacity changes run serially across all app instances.
    await client.query("SELECT pg_advisory_xact_lock(3644282)");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
