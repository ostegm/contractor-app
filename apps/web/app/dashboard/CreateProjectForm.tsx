'use client'

import { useRef } from 'react'
import { createProject } from './actions'
import { useFormStatus } from 'react-dom'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-blue-600 hover:bg-blue-700 w-full"
    >
      {pending ? 'Creating...' : 'Create Project'}
    </Button>
  )
}

export function CreateProjectForm() {
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(formData: FormData) {
    const result = await createProject(formData)
    if (result.success) {
      formRef.current?.reset()
      // Close the dialog if it exists
      document.getElementById('new-project-dialog')?.classList.add('hidden');
    }
  }

  return (
    <form ref={formRef} className="space-y-5" action={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm text-gray-200">
          Project Name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Enter project name"
          className="bg-gray-700 border-gray-600 focus:border-blue-500"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm text-gray-200">
          Description
        </Label>
        <Textarea
          id="description"
          name="description"
          required
          placeholder="Describe your project"
          className="bg-gray-700 border-gray-600 focus:border-blue-500 min-h-[100px]"
        />
        <p className="text-xs text-gray-400">
          Provide details about your construction project to get an accurate estimate.
        </p>
      </div>
      <div className="pt-4">
        <SubmitButton />
      </div>
    </form>
  )
} 