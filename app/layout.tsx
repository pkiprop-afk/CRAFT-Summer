import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/nav/Sidebar";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRAFT Benchmark",
  description: "Assessing the CRAFT prompt engineering framework — a benchmark research app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-cream font-sans text-text-body">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
