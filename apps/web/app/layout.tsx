import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppClientShell from "./app-client-shell"; // Import the new client shell

const inter = Inter({ subsets: ["latin"] });

// generateMetadata function remains here as this is a Server Component
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Contractor App",
    description: "A contractor management application",
  };
}

// RootLayout is now a simple Server Component
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen flex flex-col`}>
        <AppClientShell>{children}</AppClientShell>
      </body>
    </html>
  );
}

