import type { MetadataRoute } from "next";

/** Web app manifest (/manifest.webmanifest): "Add to Home Screen" shows the Y logo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YuliOS · Hotel Yuli",
    short_name: "YuliOS",
    description: "Sistema operativo de recepción — Hotel Yuli",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    lang: "es",
    background_color: "#FAF8F5",
    theme_color: "#4D333E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
