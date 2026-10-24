import type { MetadataRoute } from "next";
import { copy } from "@/lib/copy";
import { APP_HOME } from "@/lib/routes";

// Exactly per lihim-DESIGN.md → Export checklist (Next.js PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lihim",
    short_name: "Lihim",
    description: copy.brand.description,
    theme_color: "#0A0B0D",
    background_color: "#0A0B0D",
    // "/" is the landing page; the installed app opens on the groups home.
    start_url: APP_HOME,
    display: "standalone",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
