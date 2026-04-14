import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haushalt",
  description: "Dein persönlicher Haushalts-Tracker",
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
