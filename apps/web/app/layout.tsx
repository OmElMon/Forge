import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewPilot OS — Home service operations",
  description: "The operating system for modern home service companies.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
