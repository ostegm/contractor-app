import React, { useState, useEffect, useCallback } from 'react';
import { FileText, FolderOpen, MessageSquarePlus, LayoutDashboard, MessageSquare, RefreshCw } from 'lucide-react';
import { useView } from '../app/app-client-shell';
import { Button } from '@/components/ui/button';
import { getChatThreads } from '@/app/projects/[id]/actions';

interface NavItemProps {
  onClick?: () => void;
  icon?: React.ElementType;
  children: React.ReactNode;
  isActive?: boolean;
  className?: string;
}

const NavItem: React.FC<NavItemProps> = ({ onClick, icon: Icon, children, isActive, className }) => {
  const baseClasses = "flex items-center px-3 py-2 text-sm font-medium rounded-md w-full text-left";
  const activeClasses = isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white';
  const combinedClasses = `${baseClasses} ${activeClasses} ${className || ''}`;

  return (
    <button onClick={onClick} className={combinedClasses}>
      {Icon && <Icon className="mr-3 h-5 w-5 flex-shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  );
};

// Chat thread interface
interface ChatThread {
  id: string;
  name: string;
  lastMessageAt: string;
}

// Updated Props with chat thread selection
interface ProjectSidebarProps {
  toggleChatPanel: (forceNewChat?: boolean) => void;
  className?: string;
  projectId?: string | null; // Current project ID (if any)
  onSelectChatThread?: (threadId: string) => void; // Callback when a thread is selected
}

export function ProjectSidebar({
  toggleChatPanel,
  className,
  projectId,
  onSelectChatThread
}: ProjectSidebarProps) {
  const { currentProjectView, setCurrentProjectView } = useView(); // Use context
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);

  // Function to fetch chat threads that can be called anytime
  const fetchChatThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const threads = await getChatThreads(projectId || undefined);
      setChatThreads(threads);
    } catch (error) {
      console.error('Error fetching chat threads:', error);
    } finally {
      setIsLoadingThreads(false);
    }
  }, [projectId]);

  // Fetch chat threads when the component mounts or projectId changes
  useEffect(() => {
    fetchChatThreads();
  }, [fetchChatThreads]);

  // Poll for updated chat threads every 5 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchChatThreads();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchChatThreads]);

  return (
    <div className={`bg-gray-800 p-3 flex flex-col min-h-full transition-all duration-300 ease-in-out ${className || 'w-60'}`}>
      <nav className="flex-grow flex flex-col">
        <div className="space-y-1 mb-4">
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 truncate">
            Project Menu
          </p>
          <NavItem 
            onClick={() => setCurrentProjectView('estimate')} 
            isActive={currentProjectView === 'estimate'} 
            icon={LayoutDashboard}
          >
            Estimate
          </NavItem>
          <NavItem 
            onClick={() => setCurrentProjectView('files')} 
            isActive={currentProjectView === 'files'} 
            icon={FolderOpen}
          >
            Files
          </NavItem>
        </div>

        <hr className="my-3 border-gray-700" />

        <div className="space-y-2">
           <div className="flex items-center justify-between px-3 py-1">
             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
               Chat
             </p>
             {isLoadingThreads && <RefreshCw className="h-3 w-3 text-gray-500 animate-spin" />}
           </div>
          <Button
            onClick={() => {
              // Ensure we're explicitly starting a new chat without any thread ID
              if (onSelectChatThread) {
                onSelectChatThread('new'); // Pass 'new' as a special indicator
              }
              toggleChatPanel(true); // Pass true to force a new chat even if panel is open
            }}
            variant="ghost"
            className="w-full flex items-center justify-start px-3 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-blue-600 hover:text-white"
          >
            <MessageSquarePlus className="mr-3 h-5 w-5 flex-shrink-0" />
            <span className="truncate">New Chat</span>
          </Button>
          <div className="mt-2 space-y-1 overflow-visible pr-1">
            {chatThreads.length > 0 ? (
              chatThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => onSelectChatThread && onSelectChatThread(thread.id)}
                  className="w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-400 hover:bg-gray-700 hover:text-white group relative"
                  title={thread.name} // Basic HTML tooltip
                >
                  <MessageSquare className="mr-3 h-4 w-4 flex-shrink-0 text-gray-500" />
                  <div className="flex-1 truncate">
                    <span className="truncate">{thread.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Custom tooltip that appears on hover */}
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm rounded shadow-lg whitespace-normal max-w-xs">
                    {thread.name}
                    <div className="absolute w-2 h-2 transform rotate-45 bg-gray-900 border-l border-b border-gray-700 -left-1 top-1/2 -translate-y-1/2"></div>
                  </div>
                </button>
              ))
            ) : (
              <p className="px-3 text-xs text-gray-500 italic truncate">
                {isLoadingThreads ? 'Loading chat history...' : 'No chat history'}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex-grow"></div> 
      </nav>
    </div>
  );
} 