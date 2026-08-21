import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { SiteNav } from "./components/SiteNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One display face, used only for the masthead, section headings and
// headline stat numerals — body copy and every table stay on Geist. Fraunces
// is a variable serif with enough character to carry the page's voice
// without the condensed-capitals shout of a broadcast graphics package.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "170 Broskis",
  description: "League stats for the 170 Broskis Fantrax Premier League draft league",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SiteNav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
