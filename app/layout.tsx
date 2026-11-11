import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  metadataBase: new URL("https://untrace.app"),
  title: {
    default: "Untrace — find and remove your personal data online",
    template: "%s · Untrace",
  },
  description:
    "Untrace maps every people-search site, marketing database and ad profile that holds your name, address and phone number — then writes a deletion request to each owner for you.",
  keywords: [
    "data removal",
    "delete personal data",
    "people search opt out",
    "privacy",
    "data broker removal",
  ],
  openGraph: {
    title: "Untrace — find and remove your personal data online",
    description:
      "See everywhere you're listed. Then ask each site to delete it, in writing.",
    type: "website",
    images: [{ url: "/hero.png", width: 1456, height: 720, alt: "Untrace" }],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
