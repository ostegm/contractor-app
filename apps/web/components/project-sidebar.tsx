import React from 'react';
import { FileText, FolderOpen, MessageSquarePlus, LayoutDashboard } from 'lucide-react'; // Ensure LayoutDashboard is imported
import { useView } from '../app/app-client-shell'; // Corrected import path for useView
import { Button } from '@/components/ui/button';

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

// Updated Props: currentView and onViewChange are removed, will come from context
interface ProjectSidebarProps {
  toggleChatPanel: () => void;
  className?: string; 
}

export function ProjectSidebar({ 
  toggleChatPanel,
  className 
}: ProjectSidebarProps) {
  const { currentProjectView, setCurrentProjectView } = useView(); // Use context

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
           <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 truncate">
            Chat
          </p>
          <Button
            onClick={toggleChatPanel}
            variant="ghost"
            className="w-full flex items-center justify-start px-3 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-blue-600 hover:text-white"
          >
            <MessageSquarePlus className="mr-3 h-5 w-5 flex-shrink-0" />
            <span className="truncate">New Chat</span>
          </Button>
          <div className="mt-2 space-y-1">
            <p className="px-3 text-xs text-gray-500 italic truncate">Chat history (soon)</p>
          </div>
        </div>
        
        <div className="flex-grow"></div> 
      </nav>
    </div>
  );
} 