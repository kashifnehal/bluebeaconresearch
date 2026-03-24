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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full" style={{ backgroundColor: "#0e0e0e", color: "#e7e5e4" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
