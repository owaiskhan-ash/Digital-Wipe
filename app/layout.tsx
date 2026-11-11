import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { MobileShell } from "@/components/mobile-shell";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "remove personal data from internet",
    "remove home address from internet",
    "opt out of data brokers",
    "data broker removal",
    "people search opt out",
    "delete personal information",
    "Spokeo opt out",
    "Whitepages suppression",
    "CCPA delete request",
    "GDPR erasure request",
    "privacy tool",
    "Untrace",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "privacy",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Untrace: hundreds of sites sell your personal data to anyone who asks, and we write the deletion request for each owner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
  // Lets the dock sit above the home indicator instead of under it.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <StoreProvider>
          {/* Clears the fixed dock on phones; unchanged on desktop. */}
          <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
          <MobileShell />
        </StoreProvider>
      </body>
    </html>
  );
}
