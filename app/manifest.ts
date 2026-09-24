import type { MetadataRoute } from "next";

/** Web app manifest (/manifest.webmanifest): "Add to Home Screen" shows the Y logo. Icons: npm run icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YuliOS · Hotel Yuli",
    short_name: "YuliOS",
    description: "Hotel Yuli daily operations platform",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#4d333e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
