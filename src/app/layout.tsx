import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Lab | GPT Responses × Jev",
  description:
    "An architect's playground for text, strict structured output, and typed probability decisions. Real contracts, honest measurements.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
