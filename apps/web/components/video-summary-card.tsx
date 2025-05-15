"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ReactMarkdown from "react-markdown"
import Image from "next/image"
import { RefreshCw, Video, Info, ChevronDown, ChevronRight, Download } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface KeyFrame {
  id: string
  file_name: string
  description: string
  file_url: string
}

interface VideoSummaryCardProps {
  videoId: string
  videoFileName: string
  summaryFile: {
    id: string
    file_name: string
    file_url: string
  } | null
  frames: KeyFrame[]
  isCollapsible?: boolean
  isProcessing?: boolean
  processingError?: string | null
  storageBucket?: string
}

export function VideoSummaryCard({
  videoId,
  videoFileName,
  summaryFile,
  frames,
  isCollapsible = true,
  isProcessing = false,
  processingError = null,
  storageBucket = 'contractor-app-dev'
}: VideoSummaryCardProps) {
  const [summaryContent, setSummaryContent] = useState<string | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({})
  
  const supabase = createClient()

  const toggleExpanded = () => {
    if (isCollapsible) {
      setIsExpanded(!isExpanded)
    }
  }

  const loadSummaryContent = React.useCallback(async () => {
    if (!summaryFile) return
    
    setIsLoadingSummary(true)
    try {
      const { data, error } = await supabase.storage
        .from(storageBucket)
        .createSignedUrl(summaryFile.file_url, 3600) // 1 hour expiration
      
      if (error) {
        console.error(`Error creating signed URL for summary ${summaryFile.file_name}:`, error)
        toast.error('Failed to load video summary')
        setIsLoadingSummary(false)
        return
      }
      
      // Fetch the content using the signed URL
      const response = await fetch(data.signedUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.status} ${response.statusText}`)
      }
      
      // Convert the response to text
      const content = await response.text()
      setSummaryContent(content)
    } catch (error) {
      console.error('Error loading summary content:', error)
      toast.error('Failed to load video summary content')
    } finally {
      setIsLoadingSummary(false)
    }
  }, [summaryFile, supabase, storageBucket])

  // Load summary content if not already loaded
  React.useEffect(() => {
    if (summaryFile && !summaryContent && !isLoadingSummary) {
      loadSummaryContent()
    }
  }, [summaryFile, summaryContent, isLoadingSummary, loadSummaryContent])

  // Generate signed URLs for all frames on component mount
  React.useEffect(() => {
    if (frames.length > 0) {
      const loadFrameUrls = async () => {
        const urls: Record<string, string> = {}
        
        await Promise.all(frames.map(async (frame) => {
          try {
            // Skip if no file_url is available
            if (!frame.file_url) {
              return
            }
            
            const { data, error } = await supabase.storage
              .from(storageBucket)
              .createSignedUrl(frame.file_url, 3600) // 1 hour expiration
            
            if (error) {
              console.error(`Error creating signed URL for frame ${frame.file_name}:`, error)
              return
            }
            
            urls[frame.id] = data.signedUrl
          } catch (error) {
            console.error(`Error creating signed URL for frame ${frame.file_name}:`, error)
          }
        }))
        
        setFrameUrls(urls)
      }
      
      loadFrameUrls()
    }
  }, [frames, storageBucket, supabase])

  const downloadFrame = async (frame: KeyFrame) => {
    try {
      const { data, error } = await supabase.storage
        .from(storageBucket)
        .createSignedUrl(frame.file_url, 60, { download: true })
      
      if (error) throw error
      window.open(data.signedUrl, '_blank')
      toast.success('Frame download initiated')
    } catch (err) {
      console.error('Error downloading frame:', err)
      toast.error('Failed to download frame')
    }
  }

  if (isProcessing) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 flex flex-col items-center justify-center min-h-[200px]">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-200 mb-2">Processing Video</h3>
        <p className="text-gray-400 text-sm text-center max-w-md">
          Analyzing video content and extracting key frames. This may take a few minutes depending on the video length and content complexity.
        </p>
      </div>
    )
  }

  if (processingError) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center min-h-[200px] flex flex-col justify-center items-center">
        <div className="text-red-500 mb-4">
          <Info className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-medium text-gray-200 mb-2">Processing Failed</h3>
        <p className="text-red-400 text-sm max-w-md text-center mb-4">{processingError}</p>
        <Button className="bg-blue-600 hover:bg-blue-700">
          Try Again
        </Button>
      </div>
    )
  }

  if (!summaryFile) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center min-h-[200px] flex flex-col justify-center items-center">
        <div className="text-gray-500 mb-4">
          <Video className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-medium text-gray-200 mb-2">No Summary Available</h3>
        <p className="text-gray-400 text-sm max-w-md text-center mb-4">
          No AI summary is available for this video. Try processing the video again.
        </p>
      </div>
    )
  }

  return (
    <div className={`${isCollapsible ? 'bg-gray-800 rounded-lg border border-gray-700' : 'bg-gray-800/50 rounded-md border border-gray-700/50'} overflow-hidden`}>
      {/* Header - Only shown when component is being used standalone (isCollapsible=true) */}
      {isCollapsible && (
        <div
          className={`bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center ${isCollapsible ? 'cursor-pointer' : ''}`}
          onClick={toggleExpanded}
        >
          <div className="flex items-center space-x-2">
            <Video className="h-5 w-5 text-blue-400" />
            <h3 className="font-medium text-lg text-gray-200">{videoFileName}</h3>
            <Badge variant="outline" className="ml-2 bg-blue-900/30 text-blue-400 border-blue-700">
              AI Summary
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 p-0 text-gray-400">
            {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
        </div>
      )}

      {/* Content - Always show if not collapsible, or conditional based on expanded state */}
      {(!isCollapsible || isExpanded) && (
        <div className="p-5 space-y-6">
          {/* Summary Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">
              Video Summary
            </h4>
            {isLoadingSummary ? (
              <div className="bg-gray-900/30 rounded-lg p-4 h-32 flex items-center justify-center border border-gray-700">
                <RefreshCw className="animate-spin h-5 w-5 text-gray-500 mr-2" />
                <span className="text-gray-500">Loading summary...</span>
              </div>
            ) : summaryContent ? (
              <div className="bg-gray-900/30 p-4 rounded-lg border border-gray-700 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{summaryContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="bg-gray-900/30 rounded-lg p-4 text-center border border-gray-700">
                <p className="text-gray-500">Failed to load summary. Please try again.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2 text-blue-400 border-blue-900/50"
                  onClick={loadSummaryContent}
                >
                  Reload Summary
                </Button>
              </div>
            )}
          </div>

          {/* Key Frames Grid - Simplified */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 uppercase mb-3 flex items-center">
              Key Frames <span className="ml-2 bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">{frames.length}</span>
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {frames.map((frame) => (
                <div key={frame.id} className="bg-gray-900/30 rounded-lg border border-gray-700 overflow-hidden group shadow-md">
                  <div className="relative aspect-video bg-gray-950">
                    {frameUrls[frame.id] ? (
                      <Image
                        key={frame.id}
                        src={frameUrls[frame.id]}
                        alt={frame.description || `Frame from ${videoFileName}`}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/50 transition-opacity flex items-center justify-center">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="bg-gray-800/90 hover:bg-gray-700"
                        onClick={() => downloadFrame(frame)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-300 line-clamp-3">
                      {frame.description || 'No description available'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {frames.length === 0 && (
              <div className="bg-gray-900/30 rounded-lg p-6 text-center border border-gray-700">
                <p className="text-gray-500">No key frames available.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}