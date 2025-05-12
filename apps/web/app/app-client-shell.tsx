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
  const isDashboard = pathname === '/dashboard';

  // Update the currentProjectId when the URL changes & close chat on dashboard
  useEffect(() => {
    // Close chat if we navigate to the dashboard
    if (isDashboard) {
      setIsChatPanelOpen(false);
      setCurrentProjectId(null); // Clear project ID on dashboard
      return; // Exit early, no project matching needed
    }

    // Check if we're on a project page by looking at the URL
    const projectMatch = pathname?.match(/\/projects\/([a-zA-Z0-9-]+)/);
    if (projectMatch && projectMatch[1]) {
      setCurrentProjectId(projectMatch[1]);
    } else {
      setCurrentProjectId(null); // Clear project ID if not on a project page
    }
  }, [pathname, isDashboard]); // Add isDashboard dependency

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

  // Define classes based on panel state and dashboard view
  const sidebarWidthClass = isDashboard ? "" : "w-25"; // No width if on dashboard
  const mainContentMarginLeftClass = isDashboard ? "md:ml-0" : "md:ml-100"; // No left margin if on dashboard
  const mainContentMarginRightClass = isChatPanelOpen && !isDashboard ? "md:mr-96" : ""; // Right margin only if chat is open AND not on dashboard

  return (
    // The <body> tag will be in the actual layout.tsx (Server Component)
    // This component provides the structure within the body.
    <ViewContext.Provider value={{ currentProjectView, setCurrentProjectView }}>
      <HeaderNav />
      <div className="flex flex-1 min-h-0">
        {!isDashboard && (
          <ProjectSidebar
            toggleChatPanel={toggleChatPanel}
            className={`${sidebarWidthClass} transition-all duration-300 ease-in-out`}
            projectId={currentProjectId}
            onSelectChatThread={handleSelectChatThread}
          />
        )}
        <main className={`flex-1 p-4 overflow-y-auto ${mainContentMarginLeftClass} ${mainContentMarginRightClass} transition-all duration-300 ease-in-out`}>
          {children}
        </main>
        {!isDashboard && (
          <ChatPanel
            isOpen={isChatPanelOpen}
            onClose={closeChatPanel}
            projectId={currentProjectId}
            threadId={currentChatThreadId}
            forceNewChat={currentChatThreadId === null && isChatPanelOpen}
          />
        )}
      </div>
      <Toaster />
    </ViewContext.Provider>
  );
} 