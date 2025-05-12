import React, { useState, useEffect, useCallback } from 'react';
import { FileText, FolderOpen, MessageSquarePlus, LayoutDashboard, MessageSquare, RefreshCw, MoreHorizontal, Trash2, Edit } from 'lucide-react';
import { useView } from '../app/app-client-shell';
import { Button } from '@/components/ui/button';
import { getChatThreads, renameChatThread, deleteChatThread } from '@/app/projects/[id]/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

// --- Chat Thread Item Component ---
interface ChatThreadItemProps {
  thread: ChatThread;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ChatThreadItem: React.FC<ChatThreadItemProps> = ({ thread, onSelect, onRename, onDelete }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(thread.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setTooltipOpen(false);
  };

  const handleTooltipOpenChange = (newOpenState: boolean) => {
    if (newOpenState && isEditing) {
      setTooltipOpen(false);
    } else {
      setTooltipOpen(newOpenState);
    }
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const triggerElement = (e.target as Element).closest('[data-chat-menu-trigger="true"]');
    
    if (!triggerElement && !isEditing) {
      onSelect(thread.id);
    }
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditedName(thread.name);
    setIsEditing(true);
    setTooltipOpen(false);
  };

  const handleSaveRename = async () => {
    if (editedName.trim() === thread.name || editedName.trim() === '') {
      setIsEditing(false);
      setEditedName(thread.name);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(thread.id, editedName.trim());
    } catch (error) {
      console.error("Failed to rename chat:", error);
      setEditedName(thread.name);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  const handleCancelRename = () => {
     setIsEditing(false);
     setEditedName(thread.name);
  }

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(thread.id);
      // Optimistic update handled by parent refetching
    } catch (error) {
       console.error("Failed to delete chat:", error);
       // Maybe show a toast on error
       setIsDeleting(false); // Ensure loading state is reset on error
    }
    // No need to set isDeleting false on success if item disappears
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  return (
    <TooltipProvider delayDuration={2500}>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <div
            className="relative group"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleContainerClick}
          >
            <div
              className={`w-full flex items-center px-3 py-2 text-sm rounded-md text-gray-400 hover:bg-gray-700 hover:text-white cursor-pointer ${isEditing ? 'bg-gray-700' : ''}`}
            >
              <MessageSquare className="mr-3 h-4 w-4 flex-shrink-0 text-gray-500" />
              <div className="flex-1 truncate mr-2">
                {isEditing ? (
                   <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={handleKeyDown}
                      className="h-6 text-sm p-1 bg-gray-600 text-white border-gray-500 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                      disabled={isSaving}
                    />
                ) : (
                  <>
                    <span className="truncate block">{thread.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
               {/* 3-dot menu - Sibling to the content, INSIDE the main hoverable div */}
               <AlertDialog>
                 {!isSaving && !isDeleting && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 absolute right-1 top-1/2 transform -translate-y-1/2 z-10"
                          data-chat-menu-trigger="true"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={handleRenameClick} disabled={isEditing}>
                          <Edit className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-red-500 focus:text-red-500 focus:bg-red-900/50"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                 )}
                 <AlertDialogContent>
                   <AlertDialogHeader>
                     <AlertDialogTitle>Delete chat?</AlertDialogTitle>
                     <AlertDialogDescription>
                       This will permanently delete the chat named "<span className='font-medium'>{thread.name}</span>". This action cannot be undone.
                     </AlertDialogDescription>
                   </AlertDialogHeader>
                   <AlertDialogFooter>
                     <AlertDialogCancel>Cancel</AlertDialogCancel>
                     <AlertDialogAction
                       onClick={confirmDelete}
                       className="bg-red-600 hover:bg-red-700"
                      >Delete</AlertDialogAction>
                   </AlertDialogFooter>
                 </AlertDialogContent>
               </AlertDialog>
               {(isSaving || isDeleting) && (
                  <RefreshCw className="h-4 w-4 text-gray-500 animate-spin absolute right-2 top-1/2 transform -translate-y-1/2" />
               )}
            </div>
          </div>
        </TooltipTrigger>
        {!isEditing && tooltipOpen && (
           <TooltipContent side="right" className="max-w-xs break-words">
              {thread.name}
           </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
// --- End Chat Thread Item Component ---

// Updated Props with chat thread selection
interface ProjectSidebarProps {
  toggleChatPanel: (forceNewChat?: boolean) => void;
  className?: string;
  projectId?: string | null; // Current project ID (if any)
  onSelectChatThread?: (threadId: string) => void; // Callback when a thread is selected
}

// --- Helper function to group threads by date ---
const groupThreadsByDate = (threads: ChatThread[]) => {
  const groups: { [key: string]: ChatThread[] } = {
    Today: [],
    Yesterday: [],
    Older: [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  threads.forEach(thread => {
    const lastMessageDate = new Date(thread.lastMessageAt);
    if (lastMessageDate >= todayStart) {
      groups.Today.push(thread);
    } else if (lastMessageDate >= yesterdayStart) {
      groups.Yesterday.push(thread);
    } else {
      groups.Older.push(thread);
    }
  });

  // Sort threads within each group by lastMessageAt descending (most recent first)
  Object.keys(groups).forEach(key => {
     groups[key].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  });


  return groups;
};
// --- End Helper function ---

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
    // Only fetch if projectId is a non-empty string
    if (!projectId) {
      setChatThreads([]); // Clear threads if no project ID
      setIsLoadingThreads(false);
      return;
    }
    
    setIsLoadingThreads(true);
    try {
      // projectId is confirmed non-empty here
      const threads = await getChatThreads(projectId);
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

  // Poll for updated chat threads every 10 seconds
  useEffect(() => {
    // RESTORE POLLING
    // /*
    const intervalId = setInterval(() => {
      // Only fetch if a project is selected
      if(projectId) {
        fetchChatThreads();
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(intervalId);
    // */
  }, [fetchChatThreads, projectId]);

  // --- Rename and Delete Handlers ---
  const handleRenameThread = async (threadId: string, newName: string) => {
     try {
       await renameChatThread(threadId, newName);
       // Refetch threads to update the list after rename
       await fetchChatThreads();
     } catch (error) {
       console.error("Error renaming thread:", error);
       // Optionally show an error toast to the user
     }
   };

   const handleDeleteThread = async (threadId: string) => {
     try {
       await deleteChatThread(threadId);
       // Refetch threads to update the list after delete
       await fetchChatThreads();
     } catch (error) {
       console.error("Error deleting thread:", error);
       // Optionally show an error toast to the user
     }
   };
  // --- End Handlers ---

  // Group threads for rendering
  const groupedThreads = groupThreadsByDate(chatThreads);

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

        <div className="flex flex-col flex-grow min-h-0"> {/* Allow chat list to scroll */}
           <div className="flex items-center justify-between px-3 py-1 mb-1">
             <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
               Chat
             </p>
             {/* Place loading indicator next to title, show only if threads are loading AND exist */}
             {isLoadingThreads && chatThreads.length > 0 && <RefreshCw className="h-3 w-3 text-gray-500 animate-spin" />}
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
          {/* Scrollable chat history section */}
          <div className="mt-2 flex-grow overflow-y-auto space-y-3 pr-1">
            {chatThreads.length === 0 && !isLoadingThreads && (
               <p className="px-3 py-2 text-xs text-gray-500 italic truncate">No chat history</p>
            )}
             {chatThreads.length === 0 && isLoadingThreads && (
               <p className="px-3 py-2 text-xs text-gray-500 italic truncate">Loading chat history...</p>
            )}

            {Object.entries(groupedThreads).map(([groupName, threads]) => (
              threads.length > 0 && (
                <div key={groupName} className="space-y-1">
                   <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                     {groupName}
                   </p>
                  {threads.map((thread) => (
                    <ChatThreadItem
                      key={thread.id}
                      thread={thread}
                      onSelect={() => onSelectChatThread && onSelectChatThread(thread.id)}
                      onRename={handleRenameThread}
                      onDelete={handleDeleteThread}
                    />
                  ))}
                </div>
              )
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
} 