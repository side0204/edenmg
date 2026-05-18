import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import ToastBridge from "@/components/ToastBridge";
import BottomNav from "@/components/BottomNav";
import OfficeSubTabs from "@/components/OfficeSubTabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "(주)이든정보기술 — 통합관리시스템",
  description: "근태·작업·자재·안전을 한 곳에서",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "edenMG",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f172a" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col bg-slate-50 text-slate-900"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <OfficeSubTabs />
        {children}
        <Toaster
          position="bottom-center"
          richColors
          closeButton
          duration={3500}
          offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          toastOptions={{
            classNames: {
              toast: 'rounded-xl border shadow-lg',
            },
          }}
        />
        <Suspense fallback={null}>
          <ToastBridge />
        </Suspense>
        <BottomNav />
      </body>
    </html>
  );
}
