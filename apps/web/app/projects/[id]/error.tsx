'use client'

import { useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Project page error:', error)
  }, [error])

  return (
    <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 max-w-md w-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Error Loading Project</h2>
          <p className="text-gray-300 mb-6">
            We encountered an error while loading this project. This might be due to a network issue or the project may not exist.
          </p>
          <div className="space-y-4">
            <Button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Try again
            </Button>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full border-gray-600">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}