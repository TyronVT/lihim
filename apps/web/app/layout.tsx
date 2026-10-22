import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/toast";
import { copy } from "@/lib/copy";
import { env } from "@/lib/env";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: copy.brand.name, template: `%s · ${copy.brand.name}` },
  description: copy.brand.description,
  applicationName: copy.brand.name,
  appleWebApp: { capable: true, title: copy.brand.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: copy.brand.name,
    title: `${copy.brand.name} — ${copy.brand.tagline}`,
    description: copy.brand.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${copy.brand.name}: ${copy.brand.tagline}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${copy.brand.name} — ${copy.brand.tagline}`,
    description: copy.brand.description,
    images: ["/og.png"],
  },
  // Icons come from app/icon.svg, app/favicon.ico, app/apple-icon.png (file conventions);
  // the manifest from app/manifest.ts.
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  // Lets PinnedFooter/AppBar use env(safe-area-inset-*) on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the theme script may set data-theme before React hydrates.
    <html lang="en-PH" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
