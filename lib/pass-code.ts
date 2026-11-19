const tokenPattern = /^DPSB1-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readToken(value: unknown) {
  if (typeof value !== "string" || value.length !== 42 || !tokenPattern.test(value)) return null;
  return "DPSB1-" + value.slice(6).toLowerCase();
}

export function readQr(value: string, origin: string) {
  const raw = value.trim();
  const legacyToken = readToken(raw);
  if (legacyToken) return legacyToken;

  try {
    const url = new URL(raw);
    if (url.origin !== origin || !["/verify","/verify/"].includes(url.pathname) || url.search) return null;
    return readToken(url.hash.slice(1));
  } catch {
    return null;
  }
}

export function ticketLink(token: string, origin: string) {
  return new URL("/verify#" + token, origin).href;
}

export type TicketVerification =
  | { status: "valid" | "used"; name: string; serial: string }
  | { status: "invalid" | "unavailable" };

export function passNumber(id: number) {
  return "DPSB-" + String(id).padStart(3, "0");
}
