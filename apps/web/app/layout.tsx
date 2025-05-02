import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { HeaderNav } from "@/components/header-nav"
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Contractor App",
  description: "A contractor management application",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen`}>
        <HeaderNav />
        <div className="flex min-h-[calc(100vh-64px)]">
          <main className="flex-1 p-4 md:ml-60">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  )
}

