'use client'

import { Button } from "@/components/ui/button"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import Link from "next/link"

export default function ErrorPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="rounded-lg bg-gray-800 p-8 text-center max-w-md w-full border border-gray-700 shadow-lg">
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-red-500/10 p-3">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
        </div>
        
        <h1 className="mb-2 text-2xl font-bold">An Error Occurred</h1>
        
        <p className="text-gray-400 mb-8">
          Sorry, something went wrong while processing your request. Please try again later.
        </p>
        
        <div className="flex flex-col space-y-4">
          <Link href="/dashboard">
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          
          <Link href="/login">
            <Button variant="outline" className="w-full border-gray-600">
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
} 