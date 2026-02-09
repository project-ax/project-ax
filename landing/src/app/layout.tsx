import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ax — Like OpenClaw but with trust issues",
  description:
    "An open-source security framework for AI agents. Sandboxed execution, taint tracking, prompt injection scanning — because your AI should be powerful, not dangerous.",
  openGraph: {
    title: "ax — Like OpenClaw but with trust issues",
    description:
      "An open-source security framework for AI agents. Sandboxed execution, taint tracking, prompt injection scanning.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-bg-primary text-text-primary`}
      >
        {children}
      </body>
    </html>
  );
}
