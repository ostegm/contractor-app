import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ProjectLoading() {
  return (
    <div className="max-w-6xl mx-auto animate-pulse">
      <div className="flex flex-col">
        {/* Project header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center mb-2">
              <Link 
                href="/dashboard" 
                className="text-gray-400 hover:text-blue-400 mr-2"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="h-8 w-64 bg-gray-700 rounded"></div>
            </div>
            <div className="h-4 w-96 bg-gray-700 rounded mt-2"></div>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left sidebar - File Management */}
          <div className="md:col-span-1">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-6">
              <div className="flex justify-between items-center mb-4">
                <div className="h-6 w-20 bg-gray-700 rounded"></div>
                <div className="flex gap-2">
                  <div className="h-8 w-8 bg-gray-700 rounded"></div>
                  <div className="h-8 w-8 bg-gray-700 rounded"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>

          {/* Right content - AI Estimate */}
          <div className="md:col-span-2">
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 min-h-[300px] flex items-center justify-center">
              <div className="text-center">
                <div className="h-12 w-12 rounded-full bg-gray-700 mx-auto mb-4"></div>
                <div className="h-6 w-64 bg-gray-700 rounded mx-auto mb-4"></div>
                <div className="h-4 w-80 bg-gray-700 rounded mx-auto mb-6"></div>
                <div className="h-10 w-40 bg-gray-700 rounded mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}