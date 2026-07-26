import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const previewUrl = `${protocol}://${host}/og.png`;
  return {
    title: "Vault Surge — Streamer Companion",
    description: "The local Vault Surge streamer companion for secure, catalog-driven game effects.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Vault//Surge",
      description: "Viewer mayhem. Controlled.",
      images: [{ url: previewUrl, width: 1200, height: 630, alt: "Vault Surge local prototype" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Vault//Surge",
      description: "Viewer mayhem. Controlled.",
      images: [previewUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
