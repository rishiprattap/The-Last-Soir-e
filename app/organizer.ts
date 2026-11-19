import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const sessionAge = 8 * 60 * 60;
export const sessionCookie = "dpsb_organizer";

function same(a: string, b: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function sessionKey() {
  const key = process.env.DPSB_ORGANIZER_KEY;
  const secret = process.env.SESSION_SECRET;
  if (!key || key.length < 32 || !secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update(key).digest();
}

export function createOrganizerSession(key: unknown) {
  const secret = sessionKey();
  if (!secret || typeof key !== "string" || key.length > 256 ||
      !same(key, process.env.DPSB_ORGANIZER_KEY!)) return null;
  const value = `${Math.floor(Date.now() / 1000) + sessionAge}.${randomBytes(16).toString("hex")}`;
  return value + "." + createHmac("sha256", secret).update(value).digest("hex");
}

export async function isOrganizer() {
  const secret = sessionKey();
  if (!secret) return false;
  const value = (await cookies()).get(sessionCookie)?.value ?? "";
  const match = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(value);
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
  const signature = createHmac("sha256", secret).update(match[1] + "." + match[2]).digest("hex");
  return same(match[3], signature);
}
