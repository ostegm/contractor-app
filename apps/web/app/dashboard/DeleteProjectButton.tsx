'use client'

import { useTransition } from 'react'
import { deleteProject } from './actions'
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation if inside a link
    e.stopPropagation(); // Stop event bubbling
    
    const confirmed = window.confirm('Are you sure you want to delete this project? This action cannot be undone.')
    if (!confirmed) return

    const formData = new FormData()
    formData.append('projectId', projectId)

    startTransition(() => {
      deleteProject(formData)
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-500 hover:text-red-300 hover:bg-red-900/20 p-0 h-auto"
    >
      {isPending ? (
        <span className="text-xs">Deleting...</span>
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  )
} 