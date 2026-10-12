import type { Metadata } from "next";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "KitsuneDen",
  description: "A warm, unified dashboard for your home game servers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a light-theme user never sees a dark flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased bg-den-bg text-den-text">{children}</body>
    </html>
  );
}
