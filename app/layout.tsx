import "./globals.css";
import type { Metadata } from "next";
import { SITE } from "@/lib/site";

const description =
  "Swedish interest rates, the yield curve, inflation vs the 2% target and mortgage rates, from official Riksbank and SCB data, updated every weekday.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: "Swedish Rates & Inflation Monitor",
  description,
  openGraph: { title: "Swedish Rates & Inflation Monitor", description, type: "website", url: "/" },
  twitter: { card: "summary_large_image", title: "Swedish Rates & Inflation Monitor", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
