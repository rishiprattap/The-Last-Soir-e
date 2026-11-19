import { NextResponse } from "next/server";
import { createOrganizerSession, sessionAge, sessionCookie } from "../../organizer";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : requestUrl.origin;
  if (origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const signOut = form.get("action") === "signout";
  const session = signOut ? "" : createOrganizerSession(form.get("key"));
  const target = signOut || !session ? "/admin/login" : "/admin";
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: target + (!signOut && !session ? "?error=1" : ""),
      "Cache-Control": "no-store",
    },
  });
  if (signOut || session) {
    response.cookies.set(sessionCookie, session ?? "", {
      path: "/", maxAge: signOut ? 0 : sessionAge,
      httpOnly: true, sameSite: "lax",
      secure: process.env.APP_URL ? expected.startsWith("https:") : requestUrl.protocol === "https:",
    });
  }
  return response;
}
