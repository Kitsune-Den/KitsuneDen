import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam & Settlements - Server Dashboard",
  description: "Minecraft server dashboard for Steam & Settlements",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-den-bg text-den-text">
        {children}
      </body>
    </html>
  );
}
