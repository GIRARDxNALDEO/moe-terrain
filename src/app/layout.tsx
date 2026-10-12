import type { Metadata, Viewport } from "next";
import "./globals.css";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const metadata: Metadata = {
  title: "MOE Terrain · Mémoire du chantier",
  description:
    "Observations, réunions et plans. Vos données restent sur cet appareil.",
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      {
        url: `${base}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      { url: `${base}/icons/favicon.png`, sizes: "32x32", type: "image/png" },
    ],
    apple: { url: `${base}/icons/apple-touch-icon.png`, sizes: "180x180" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MOE Terrain",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1D2D44",
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
