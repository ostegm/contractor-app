"use client"

import { useState, useRef, useEffect } from "react"
import { Pencil, MessageSquare, Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useView } from "@/app/app-client-shell"
import { cn } from "@/lib/utils"

interface EditableEstimateItemProps {
  id?: string
  label?: string
  value: string | number
  isEditing?: boolean
  fieldPath: string
  onEdit?: (value: string) => void
  onDelete?: () => void
  canDelete?: boolean
  className?: string
  isMarkdown?: boolean
  children?: React.ReactNode
}

export function EditableEstimateItem({
  id,
  label,
  value,
  isEditing: externalIsEditing,
  fieldPath,
  onEdit,
  onDelete,
  canDelete = false,
  className,
  isMarkdown = false,
  children
}: EditableEstimateItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(externalIsEditing || false)
  const [editValue, setEditValue] = useState(value.toString())
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  
  // Access the chat panel functionality from context
  const { openChat } = useView()
  
  // Sync with external editing state if provided
  useEffect(() => {
    if (externalIsEditing !== undefined) {
      setIsEditing(externalIsEditing)
    }
  }, [externalIsEditing])
  
  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])
  
  // Handle direct edit
  const handleEdit = () => {
    setIsEditing(true)
  }
  
  // Handle save
  const handleSave = () => {
    if (onEdit) {
      onEdit(editValue)
    }
    setIsEditing(false)
  }
  
  // Handle cancel
  const handleCancel = () => {
    setEditValue(value.toString())
    setIsEditing(false)
  }
  
  // Handle chat edit
  const handleChatEdit = () => {
    const fieldName = fieldPath.split('.').pop() || fieldPath
    const parentName = fieldPath.includes('.') 
      ? fieldPath.split('.').slice(0, -1).join('.') 
      : 'estimate'
    
    // Format a contextual message
    let message = ''
    
    if (label) {
      message = `For the "${label}" I want to make the following changes: `
    } else {
      message = `For the ${fieldName} in ${parentName} I want to make the following changes: `
    }
    
    // Open chat with the pre-filled message
    if (openChat) {
      openChat(message)
    }
  }
  
  // Handle delete
  const handleDelete = () => {
    if (onDelete) {
      if (window.confirm('Are you sure you want to delete this item?')) {
        onDelete()
      }
    }
  }
  
  return (
    <div 
      className={cn(
        "relative group", 
        isEditing ? "bg-gray-700/30 border border-blue-500 rounded" : "",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Label if provided */}
      {label && !isEditing && (
        <div className="text-sm font-medium text-gray-400 mb-1">{label}</div>
      )}
      
      {/* Content area */}
      {isEditing ? (
        <div className="p-2">
          {/* Label inside edit mode */}
          {label && (
            <div className="text-sm font-medium text-gray-400 mb-2">{label}</div>
          )}
          
          {/* Edit input/textarea based on content type */}
          {isMarkdown || value.toString().length > 100 ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
              rows={Math.min(10, Math.max(3, editValue.split('\n').length + 1))}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
            />
          )}
          
          {/* Edit controls */}
          <div className="flex justify-end space-x-2 mt-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="h-8 bg-blue-600 hover:bg-blue-700">
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Display children if provided, otherwise display value */}
          <div className="editable-content relative">
            {children || value}
            
            {/* Hover controls */}
            {isHovered && !isEditing && (
              <div className="absolute right-2 top-2 flex space-x-1 bg-gray-800 rounded-md border border-gray-700 shadow-lg p-1 z-10">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleEdit}
                        className="h-7 w-7 p-1 text-blue-400 hover:text-blue-300 hover:bg-gray-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit directly</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleChatEdit}
                        className="h-7 w-7 p-1 text-green-400 hover:text-green-300 hover:bg-gray-700"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit via chat</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {canDelete && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDelete}
                          className="h-7 w-7 p-1 text-red-400 hover:text-red-300 hover:bg-gray-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete item</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface AddLineItemButtonProps {
  onClick: () => void
  category?: string
}

export function AddLineItemButton({ onClick, category }: AddLineItemButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="w-full flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 border border-dashed border-blue-500/30 rounded-md py-2 mt-2"
    >
      <Plus className="h-4 w-4 mr-2" />
      Add {category ? `${category} ` : ''}Line Item
    </Button>
  )
}