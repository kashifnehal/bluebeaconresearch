import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "GeoSignal",
  description: "Conflict intelligence → actionable trading signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-surface-app text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
