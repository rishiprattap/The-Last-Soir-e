import { isOrganizer } from "../../organizer";
import { database, withPassCapacity } from "../../../lib/database";
import { readToken } from "../../../lib/pass-code";

export const dynamic = "force-dynamic";
const capacity = 50;
const fields = 'id, name, token, created_at AS "createdAt", admitted_at AS "admittedAt", cancelled_at AS "cancelledAt"';
const respond = (payload: object, status = 200) =>
  Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (!(await isOrganizer())) return respond({ error: "Organizer access is required." }, 403);
  try {
    const { rows } = await database().query(`SELECT ${fields} FROM passes ORDER BY id`);
    return respond({ passes: rows, capacity });
  } catch {
    return respond({ error: "Could not load the guest list." }, 503);
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
    request.headers.get("sec-fetch-site") === "cross-site") {
    return respond({ error: "Invalid request." }, 400);
  }
  if (!(await isOrganizer())) return respond({ error: "Organizer access is required." }, 403);
  let body: Record<string, unknown>;
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid request");
    body = data as Record<string, unknown>;
  } catch {
    return respond({ error: "Invalid request." }, 400);
  }

  try {
    const db = database();
    if (body.action === "issue") {
      const names = Array.isArray(body.names) ? body.names : [body.name];
      if (!names.length || names.length > capacity || names.some(name =>
        typeof name !== "string" || !name.trim() || name.trim().length > 80 || /[\r\n\0]/.test(name)
      )) return respond({ error: "Enter 1–50 guest names, each up to 80 characters." }, 400);

      const records = names.map(name => ({name: name.trim(), token: "DPSB1-" + crypto.randomUUID()}));
      const { rows } = await withPassCapacity(client => client.query(
        `INSERT INTO passes (name, token, created_at)
         SELECT name, token, now() FROM jsonb_to_recordset($1::jsonb) AS ticket(name text, token text)
         WHERE (SELECT count(*) FROM passes WHERE cancelled_at IS NULL) + $2 <= $3
         RETURNING ${fields}`,
        [JSON.stringify(records), records.length, capacity],
      ));
      return rows.length ? respond({ pass: rows[0], passes: rows }, 201) :
        respond({ error: "That list would exceed 50 active passes. Submit only the remaining number of guests." }, 409);
    }

    if (body.action === "check" || body.action === "admit") {
      const token = readToken(body.code);
      if (!token) return respond({ pass: null });
      if (body.action === "admit") {
        const { rows } = await db.query(
          `UPDATE passes SET admitted_at = now()
           WHERE token = $1 AND admitted_at IS NULL AND cancelled_at IS NULL RETURNING ${fields}`, [token],
        );
        if (rows.length) return respond({ pass: rows[0], admittedNow: true });
      }
      const { rows } = await db.query(`SELECT ${fields} FROM passes WHERE token = $1`, [token]);
      return respond({ pass: rows[0] ?? null, admittedNow: false });
    }

    if (body.action === "cancel" || body.action === "restore") {
      if (typeof body.id !== "number" || !Number.isSafeInteger(body.id) || body.id < 1 || body.id > 2147483647) {
        return respond({ error: "Invalid pass number." }, 400);
      }
      const cancel = body.action === "cancel";
      const { rows } = cancel ? await db.query(
        `UPDATE passes SET cancelled_at = now() WHERE id = $1 AND admitted_at IS NULL
         AND cancelled_at IS NULL RETURNING ${fields}`, [body.id],
      ) : await withPassCapacity(client => client.query(
        `UPDATE passes SET cancelled_at = NULL WHERE id = $1 AND admitted_at IS NULL AND cancelled_at IS NOT NULL
         AND (SELECT count(*) FROM passes WHERE cancelled_at IS NULL) < $2 RETURNING ${fields}`, [body.id, capacity],
      ));
      return rows.length ? respond({ pass: rows[0] }) : respond({
        error: cancel ? "Only unused, active passes can be cancelled." :
          "This pass could not be restored. Check its status and the 50-pass limit.",
      }, 409);
    }

    return respond({ error: "Unknown action." }, 400);
  } catch {
    return respond({ error: "The pass service could not complete the request. Try again." }, 503);
  }
}
