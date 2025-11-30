import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Cieplarnia Dashboard",
  description: "Live climate metrics from the greenhouse",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={inter.variable} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
