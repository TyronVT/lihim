import type { MetadataRoute } from "next";

// Exactly per lihim-DESIGN.md → Export checklist (Next.js PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lihim",
    short_name: "Lihim",
    description: "Anonymous polls for your group. Only members answer, once each.",
    theme_color: "#0A0B0D",
    background_color: "#0A0B0D",
    display: "standalone",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
