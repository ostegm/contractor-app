'use client'

import { Button } from "@/components/ui/button"
import { FolderPlus, Plus } from "lucide-react"

export function NewProjectButton() {
  return (
    <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-6 h-[220px] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="rounded-full bg-gray-700/50 p-3 mb-4">
          <FolderPlus className="h-8 w-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-medium text-center mb-2">Create New Project</h3>
        <p className="text-gray-400 text-sm text-center mb-6">
          Start a new construction estimate
        </p>
      </div>
      <Button 
        className="w-full bg-blue-600 hover:bg-blue-700"
        onClick={() => {
          // Open the modal or form
          document.getElementById('new-project-dialog')?.classList.remove('hidden');
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        New Project
      </Button>
    </div>
  )
}