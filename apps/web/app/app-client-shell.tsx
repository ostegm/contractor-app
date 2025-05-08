'use client';

import React, { useState, createContext, useContext, Dispatch, SetStateAction } from "react";
import { Inter } from "next/font/google"; // Keep Inter if needed for className
import "./globals.css"; // Ensure globals are imported if body className relies on them here
import { HeaderNav } from "@/components/header-nav";
import { ProjectSidebar } from "../components/project-sidebar"; 
import { ChatPanel } from "@/components/chat-panel";
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"] });

// Context for View Management
interface ViewContextType {
  currentProjectView: 'estimate' | 'files';
  setCurrentProjectView: Dispatch<SetStateAction<'estimate' | 'files'>>;
}

export const ViewContext = createContext<ViewContextType | undefined>(undefined);

export const useView = () => {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
};

interface AppClientShellProps {
  children: React.ReactNode;
}

export default function AppClientShell({ children }: AppClientShellProps) {
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const [currentProjectView, setCurrentProjectView] = useState<'estimate' | 'files'>('estimate');

  const toggleChatPanel = () => {
    setIsChatPanelOpen(!isChatPanelOpen);
  };

  const sidebarWidthClass = isChatPanelOpen ? "w-40" : "w-60";
  const mainContentMarginClass = isChatPanelOpen ? "md:ml-40" : "md:ml-60"; 
  const mainContentWidthClass = isChatPanelOpen ? "md:mr-96" : "";

  return (
    // The <body> tag will be in the actual layout.tsx (Server Component)
    // This component provides the structure within the body.
    <ViewContext.Provider value={{ currentProjectView, setCurrentProjectView }}>
      <HeaderNav />
      <div className="flex flex-1 min-h-0"> 
        <ProjectSidebar 
          toggleChatPanel={toggleChatPanel} 
          className={sidebarWidthClass} 
        />
        <main className={`flex-1 p-4 overflow-y-auto ${mainContentMarginClass} ${mainContentWidthClass} transition-all duration-300 ease-in-out`}>
          {children}
        </main>
        <ChatPanel isOpen={isChatPanelOpen} onClose={toggleChatPanel} />
      </div>
      <Toaster />
    </ViewContext.Provider>
  );
} 