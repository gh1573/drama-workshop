import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "剧集智能创编工坊 DRAMA STUDIO — 微短剧分镜智能创作平台",
  description:
    "专注于微短剧与影视作品的剧本推演、镜头编排与成片合成工作台。选题材、输入梗概，AI 实时推演场次化剧本与分镜，一键导出 JSON 工程与制作清单。",
  keywords: [
    "短剧",
    "分镜",
    "剧本推演",
    "AI 编剧",
    "竖屏短剧",
    "DRAMA STUDIO",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
