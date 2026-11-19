import type { Metadata } from "next";
import VerifyTicket from "./ticket";

export const metadata: Metadata = {
  title: "Verify a ticket | The Last Soirée",
  description: "Check your ticket for The Last Soirée.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyPage() {
  return <VerifyTicket />;
}
