// Web app manifest: lets phones "Add to Home screen" / install JobPulse like an app.
// Next.js serves this at /manifest.webmanifest and links it automatically.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobPulse",
    short_name: "JobPulse",
    description: "Personal job alerts for Bangladesh",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
