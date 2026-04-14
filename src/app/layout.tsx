import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haushalt",
  description: "Dein persönlicher Haushalts-Assistent",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Haushalt",
  },
  icons: {
    apple: "/icon.png",
  },
  other: {
    "theme-color": "#C4856E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
