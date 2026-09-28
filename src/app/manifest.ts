import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf Stats",
    short_name: "Golf Stats",
    description: "Je golfrondes, statistieken en handicapverloop",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ee",
    theme_color: "#1f6f4a",
    lang: "nl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Share target: vanuit galerij of Hole19 een screenshot direct delen
    ...({
      share_target: {
        action: "/share-target",
        method: "POST",
        enctype: "multipart/form-data",
        params: { files: [{ name: "images", accept: ["image/*"] }] },
      },
    } as object),
  };
}
