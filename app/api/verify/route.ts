import { database } from "../../../lib/database";
import { passNumber, readToken } from "../../../lib/pass-code";

import type { TicketVerification } from "../../../lib/pass-code";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function respond(result: TicketVerification, status = 200) {
  return Response.json(result, { headers, status });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return respond({ status: "invalid" }, 400);
  }

  let token: string | null;
  try {
    const data = await request.json() as { token?: unknown } | null;
    token = readToken(data?.token);
  } catch {
    token = null;
  }

  if (!token) return respond({ status: "invalid" });

  try {
    const { rows: [pass] } = await database().query<{ id: number; name: string; admitted_at: Date | null }>(
      "SELECT id, name, admitted_at FROM passes WHERE token = $1 AND cancelled_at IS NULL", [token],
    );
    if (!pass) return respond({ status: "invalid" });
    return respond({
      status: pass.admitted_at ? "used" : "valid",
      name: pass.name,
      serial: passNumber(pass.id),
    });
  } catch {
    return respond({ status: "unavailable" }, 503);
  }
}
