import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/nav/Sidebar";
import { ReviewModeProvider } from "@/components/review/ReviewModeContext";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { isReviewMode } from "@/lib/reviewMode";
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
  // Resolved on the server and handed to client components through the
  // provider, so REVIEW_MODE stays a single server-side variable.
  const reviewMode = isReviewMode();

  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-cream font-sans text-text-body">
        <ReviewModeProvider value={reviewMode}>
          <Sidebar />
          <main className="flex-1 min-w-0">
            {reviewMode ? <ReviewBanner /> : null}
            <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">{children}</div>
          </main>
        </ReviewModeProvider>
      </body>
    </html>
  );
}
