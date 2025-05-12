'use client';

import React, { useState, useEffect, createContext, useContext, Dispatch, SetStateAction } from "react";
import { Inter } from "next/font/google"; // Keep Inter if needed for className
import "./globals.css"; // Ensure globals are imported if body className relies on them here
import { HeaderNav } from "@/components/header-nav";
import { ProjectSidebar } from "../components/project-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { Toaster } from 'sonner';
import { usePathname } from 'next/navigation';

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
  // Extract the current project ID from the URL if available
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  // Track the selected chat thread
  const [currentChatThreadId, setCurrentChatThreadId] = useState<string | null>(null);

  // Get the current pathname from Next.js
  const pathname = usePathname();

  // Update the currentProjectId when the URL changes
  useEffect(() => {
    // Check if we're on a project page by looking at the URL
    const projectMatch = pathname?.match(/\/projects\/([a-zA-Z0-9-]+)/);
    if (projectMatch && projectMatch[1]) {
      setCurrentProjectId(projectMatch[1]);
    } else {
      setCurrentProjectId(null);
    }
  }, [pathname]);

  const toggleChatPanel = (forceNewChat = false) => {
    // If panel is closed, or forcing a new chat, start a new chat
    if (!isChatPanelOpen || forceNewChat) {
      setCurrentChatThreadId(null); // Clear thread ID to create a new chat
      setIsChatPanelOpen(true); // Make sure panel is open
    } else {
      // If panel is open and not forcing a new chat, close it
      setIsChatPanelOpen(false);
    }
  };

  // Dedicated function to close the panel, passed to ChatPanel
  const closeChatPanel = () => {
    setIsChatPanelOpen(false);
  };

  // Handler for chat thread selection from sidebar
  const handleSelectChatThread = (threadId: string) => {
    // Special case for "new" - this means we want to start a fresh chat
    if (threadId === 'new') {
      setCurrentChatThreadId(null);
    } else {
      setCurrentChatThreadId(threadId);
    }

    // Open the chat panel if it's not already open
    if (!isChatPanelOpen) {
      setIsChatPanelOpen(true);
    }
  };

  // Define classes based on panel state
  const sidebarWidthClass = "w-25"; // User preference
  const mainContentMarginLeftClass = "md:ml-10"; // User preference
  const mainContentMarginRightClass = isChatPanelOpen ? "md:mr-96" : ""; // Match ChatPanel width (w-96)

  return (
    // The <body> tag will be in the actual layout.tsx (Server Component)
    // This component provides the structure within the body.
    <ViewContext.Provider value={{ currentProjectView, setCurrentProjectView }}>
      <HeaderNav />
      <div className="flex flex-1 min-h-0">
        <ProjectSidebar
          toggleChatPanel={toggleChatPanel}
          className={`${sidebarWidthClass} transition-all duration-300 ease-in-out`} // Ensure transition is on the sidebar too
          projectId={currentProjectId}
          onSelectChatThread={handleSelectChatThread}
        />
        <main className={`flex-1 p-0 overflow-y-auto ${mainContentMarginLeftClass} ${mainContentMarginRightClass} transition-all duration-300 ease-in-out`}>
          {children}
        </main>
        <ChatPanel
          isOpen={isChatPanelOpen}
          onClose={closeChatPanel}
          projectId={currentProjectId}
          threadId={currentChatThreadId}
          forceNewChat={currentChatThreadId === null && isChatPanelOpen}
        />
      </div>
      <Toaster />
    </ViewContext.Provider>
  );
} 