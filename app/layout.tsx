import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fjordfall — The Five Hunts",
  description: "A cooperative Viking monster hunt across islands, sky waterfalls, sea and the depths. Join a crew by room code.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
