import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import ToastBridge from "@/components/ToastBridge";
import BottomNav from "@/components/BottomNav";
import OfficeSubTabs from "@/components/OfficeSubTabs";
import { createClient } from "@/lib/supabase/server";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 현장 직원이면 사무 탭과 사무 서브탭을 숨김.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isFieldWorker = false;
  if (user) {
    const { data } = await supabase
      .from("employees")
      .select("workplace_type")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    isFieldWorker = (data as { workplace_type?: string } | null)?.workplace_type === "현장";
  }

  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <OfficeSubTabs hideOffice={isFieldWorker} />
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
        <BottomNav hideOffice={isFieldWorker} />
      </body>
    </html>
  );
}
