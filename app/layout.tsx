import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Body Notebook",
  description: "건강/운동/무릎 통증 기록",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* ✅ 모바일/브라우저 강제 다크모드 영향 줄이기 */}
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#f6f7f9" />
      </head>
      <body style={{ margin: 0, background: "#f6f7f9" }}>{children}</body>
    </html>
  );
}