'use client'

import { CreateProjectForm } from "@/app/dashboard/CreateProjectForm"

export function NewProjectDialog() {
  return (
    <div id="new-project-dialog" className="hidden fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full relative">
        <button 
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          onClick={() => {
            document.getElementById('new-project-dialog')?.classList.add('hidden');
          }}
        >
          <span className="text-2xl">&times;</span>
        </button>
        <h2 className="text-xl font-semibold mb-6">Create New Project</h2>
        <CreateProjectForm />
      </div>
    </div>
  )
}