import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "The Last Soirée | DPSB",
  description: "Ticket verification and door check-in for The Last Soirée.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
