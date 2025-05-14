"use client"

import React, { useState, useEffect, use, useCallback } from "react"
import { useView, ViewContext } from "../../app-client-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { VideoSummaryCard } from "@/components/video-summary-card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Trash2, Upload, File, ArrowLeft, FileText, Play, ChevronDown, ChevronRight, StickyNote, Download, RefreshCw, LayoutDashboard, FolderOpen, TriangleAlert, Music, Video, Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { uploadFile, clearProjectInfo, clearProjectEstimate, startEstimateGeneration, checkEstimateStatus, startVideoProcessing } from "./actions"
import { ConstructionProjectData, InputFile, EstimateLineItem } from "@/baml_client/baml_client/types"
import { toast } from "sonner"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import Image from "next/image"

// Storage bucket name used in Supabase URLs
const STORAGE_BUCKET_NAME = 'contractor-app-dev';

interface UploadedFile {
  id: string
  file_name: string
  description?: string
  content?: string
  type?: string
  file_url: string
  uploaded_at: string
  origin?: string
  parent_file_id?: string
}

interface Project {
  id: string
  name: string
  description: string
  project_info?: string
  ai_estimate?: string
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { currentProjectView } = useView()
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [aiGeneratedFiles, setAiGeneratedFiles] = useState<UploadedFile[]>([])
  const [showAiFiles, setShowAiFiles] = useState<boolean>(false)
  const [processingVideoIds, setProcessingVideoIds] = useState<Record<string, string>>({})
  const [videoProcessingErrors, setVideoProcessingErrors] = useState<Record<string, string>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [estimateStatus, setEstimateStatus] = useState<'not_started' | 'processing' | 'completed' | 'failed'>('not_started')
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [projectInfo, setProjectInfo] = useState<string>("")
  const [project, setProject] = useState<Project | null>(null)
  const [aiEstimate, setAiEstimate] = useState<ConstructionProjectData | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [fileDescription, setFileDescription] = useState("")
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [filePreviewDialogOpen, setFilePreviewDialogOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [signedImageUrl, setSignedImageUrl] = useState<string>('')
  const [signedAudioUrl, setSignedAudioUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isEstimateOutdated, setIsEstimateOutdated] = useState(false)
  const [initialFileCount, setInitialFileCount] = useState(0)
  const supabase = createClient()

  // Get context function to register the callback
  const { setOnEstimateUpdateTriggeredByChat } = useView();

  // Track which fields were updated by a patch operation
  const [patchedFields, setPatchedFields] = useState<string[]>([]);

  // Callback for chat component to trigger loading state
  const handleEstimateUpdateTriggered = useCallback((isPatch?: boolean, fields?: string[]) => {
    if (isPatch && fields) {
      // For patches, we don't show the loading state but track fields to highlight
      setPatchedFields(fields);
      toast.info('Quick patch in progress...', { duration: 2000 });
    } else {
      // For full updates, show the loading state
      setEstimateStatus('processing');
      setEstimateError(null); // Clear previous errors
      toast.info('Estimate update triggered by chat...');
    }
  }, []);

  // Register/unregister the callback with the context when project ID changes
  useEffect(() => {
    if (id && setOnEstimateUpdateTriggeredByChat) {
      // Register the callback for the current project ID
      setOnEstimateUpdateTriggeredByChat(() => handleEstimateUpdateTriggered);
      
      // Cleanup function to unregister when component unmounts or ID changes
      return () => {
        setOnEstimateUpdateTriggeredByChat(null);
      };
    }
    // If no ID, ensure callback is null
    if (!id && setOnEstimateUpdateTriggeredByChat) {
      setOnEstimateUpdateTriggeredByChat(null);
    }
  }, [id, setOnEstimateUpdateTriggeredByChat, handleEstimateUpdateTriggered]);

  // useCallback for fetchProject
  const fetchProject = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching project:', error)
      return
    }

    setProject(data)
    if (data.project_info) {
      setProjectInfo(data.project_info)
    }
    
    // Parse the AI estimate if it exists
    if (data.ai_estimate) {
      try {
        const estimate = JSON.parse(data.ai_estimate)
        setAiEstimate(estimate)
      } catch (error) {
        console.error('Error parsing AI estimate:', error)
        setAiEstimate(null); // Ensure aiEstimate is null if parsing fails
      }
    } else {
      setAiEstimate(null); // Ensure aiEstimate is null if data.ai_estimate is not present
    }
  }, [id, supabase]);
  
  // State for expanded video files
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

  // Function to toggle expansion of a video file
  const toggleVideoExpansion = useCallback((fileId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedVideoId(prev => prev === fileId ? null : fileId);
  }, []);

  // useCallback for fetchFiles
  const fetchFiles = useCallback(async () => {
    // Fetch user-uploaded files
    const { data: userFiles, error: userFilesError } = await supabase
      .from('files')
      .select('*')
      .eq('project_id', id)
      .eq('origin', 'user')
      .is('parent_file_id', null) // Only get original files, not derived ones

    if (userFilesError) {
      console.error('Error fetching user files:', userFilesError)
      return
    }

    setUploadedFiles(userFiles || [])

    // Fetch AI-generated files separately
    const { data: aiFiles, error: aiFilesError } = await supabase
      .from('files')
      .select('*')
      .eq('project_id', id)
      .eq('origin', 'ai')

    if (aiFilesError) {
      console.error('Error fetching AI-generated files:', aiFilesError)
      return
    }

    setAiGeneratedFiles(aiFiles || [])
  }, [id, supabase]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchFiles(), fetchProject()])
      setIsLoading(false)
    }
    
    loadData()
  }, [fetchFiles, fetchProject])
  
  // Initialize estimate status when the page loads
  useEffect(() => {
    if (!id || isLoading) return;

    const checkStatusAndUpdate = async () => {
      const result = await checkEstimateStatus(id);
      if (result.status) {
        // Map 'pending' from TaskJobStatus to 'processing' for the UI state
        const uiStatus = result.status === 'pending' ? 'processing' : result.status as 'not_started' | 'processing' | 'completed' | 'failed';
        setEstimateStatus(uiStatus);
        if (result.error) {
          setEstimateError(result.error);
        }

        // If the status is 'completed' but we don't have the estimate data in our UI state yet,
        // fetch it to ensure the UI is up-to-date.
        if (uiStatus === 'completed' && !aiEstimate) {
          await fetchProject();
        }
      }
    };

    checkStatusAndUpdate();

    // Check for video processing jobs
    const checkVideoProcessingJobs = async () => {
      // Get all video files
      const videoFiles = uploadedFiles.filter(file => file.type?.startsWith('video/') || isVideoFile(file.file_name));
      if (videoFiles.length === 0) return;

      // For each video file, check if there's an active processing job
      const newProcessingIds: Record<string, string> = {};
      const newErrors: Record<string, string> = {};

      const { data: jobs, error: jobsError } = await supabase
        .from('task_jobs')
        .select('*')
        .eq('project_id', id)
        .eq('job_type', 'video_process')
        .in('status', ['processing', 'pending', 'failed']);

      if (jobsError) {
        console.error('Error fetching video processing jobs:', jobsError);
        return;
      }

      if (jobs && jobs.length > 0) {
        for (const job of jobs) {
          // Check if the job has a file_id field (might be called just file_id)
          const fileId = job.file_id;
          if (fileId) {
            if (job.status === 'failed') {
              newErrors[fileId] = job.error_message || 'Video processing failed';
            } else if (job.status === 'processing' || job.status === 'pending') {
              newProcessingIds[fileId] = job.id;
            }
          }
        }
      }

      setProcessingVideoIds(newProcessingIds);
      setVideoProcessingErrors(newErrors);
    };

    checkVideoProcessingJobs();
  }, [id, isLoading, fetchProject, aiEstimate, uploadedFiles]);
  
  // Poll for status updates when processing estimates
  useEffect(() => {
    if (estimateStatus !== 'processing') return;

    const pollInterval = setInterval(async () => {
      const result = await checkEstimateStatus(id);

      if (result.status === 'completed') {
        setEstimateStatus('completed');
        // Refresh the page to get the updated estimate
        fetchProject();
        toast.success('Estimate generation completed');
      } else if (result.status === 'failed') {
        setEstimateStatus('failed');
        setEstimateError(result.error || 'Failed to generate estimate');
        toast.error(`Estimate generation failed: ${result.error || 'Unknown error'}`);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [estimateStatus, id, fetchProject]);

  // Effect to clear patched fields after they've been displayed
  useEffect(() => {
    if (patchedFields.length > 0) {
      // Give time for the UI to render and apply the flash animation
      const clearTimer = setTimeout(() => {
        setPatchedFields([]);
      }, 2000); // Clear after 2 seconds to match animation duration

      return () => clearTimeout(clearTimer);
    }
  }, [patchedFields]);

  // Poll for video processing status updates
  useEffect(() => {
    // Check if we have any videos being processed
    const hasProcessingVideos = Object.keys(processingVideoIds).length > 0;
    if (!hasProcessingVideos) return;

    // Import at the beginning of polling to ensure it's defined
    const { checkVideoProcessingStatus } = require('./actions');

    const pollInterval = setInterval(async () => {
      // For each processing video, check its status
      for (const [fileId, jobId] of Object.entries(processingVideoIds)) {
        try {
          const result = await checkVideoProcessingStatus(jobId);

          if (result.status === 'completed') {
            // Successfully completed processing
            // Remove from processing list
            setProcessingVideoIds(prev => {
              const newState = {...prev};
              delete newState[fileId];
              return newState;
            });
            // Refresh files to get the AI-generated files
            await fetchFiles();
            toast.success('Video processing completed');
          } else if (result.status === 'failed') {
            // Processing failed
            console.error(`Video processing failed for file ${fileId}, job ${jobId}:`, result.error);
            // Update the errors map
            setVideoProcessingErrors(prev => ({
              ...prev,
              [fileId]: result.error || 'Unknown error during video processing'
            }));
            // Remove from processing list
            setProcessingVideoIds(prev => {
              const newState = {...prev};
              delete newState[fileId];
              return newState;
            });
            toast.error(`Video processing failed: ${result.error || 'Unknown error'}`);
            // Still refresh files in case there are partial results
            await fetchFiles();
          }
          // If still processing, keep polling
        } catch (err) {
          console.error(`Error checking video processing status for job ${jobId}:`, err);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [processingVideoIds, fetchFiles]);

  // Track when files change to mark estimate as outdated
  useEffect(() => {
    // Skip the initial render
    if (isLoading) return
    
    // If we haven't set the initial file count yet, set it now
    if (initialFileCount === 0 && uploadedFiles.length > 0) {
      setInitialFileCount(uploadedFiles.length)
      return
    }
    
    // If file count has changed and we have an estimate, mark it as outdated
    if (initialFileCount > 0 && uploadedFiles.length !== initialFileCount && aiEstimate) {
      setIsEstimateOutdated(true)
    }
  }, [uploadedFiles, initialFileCount, aiEstimate, isLoading])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    
    setFileToUpload(files[0])
    setUploadDialogOpen(true)
  }

  const handleFileUpload = async () => {
    if (!fileToUpload) return

    setIsUploading(true)

    // Check if it's a large video file and show special notice
    const isLargeVideo = fileToUpload.type.startsWith('video/') &&
                        (fileToUpload.size / (1024 * 1024)) > 30; // 30MB threshold

    if (isLargeVideo) {
      // Show a persistent toast for large videos
      toast.info(
        `Uploading large video file (${(fileToUpload.size / (1024 * 1024)).toFixed(1)}MB). This may take a while...`,
        { duration: 10000, id: 'large-video-upload' }
      );
    }

    try {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      formData.append('description', fileDescription)

      const result = await uploadFile(formData, id)

      if (result.error) {
        toast.error(`Failed to upload ${fileToUpload.name}: ${result.error}`)
      } else {
        toast.success(`Successfully uploaded ${fileToUpload.name}`)

        // If it's a video that was successfully uploaded and automatic processing started
        if (fileToUpload.type.startsWith('video/') && result.isVideoProcessing) {
          toast.success(`Video processing started${result.processingError ? ' with warnings' : ''}`, {
            description: result.processingError || 'Your video is being analyzed. This may take several minutes.',
            duration: 5000
          });

          // Add to the processing videos state immediately for better UX
          if (result.processingJobId) {
            setProcessingVideoIds(prev => ({ ...prev, [result.fileId]: result.processingJobId }));
          }
        }

        setUploadDialogOpen(false)
        setFileToUpload(null)
        setFileDescription("")
        fetchFiles() // Refresh the files list

        // Mark estimate as outdated if it exists
        if (aiEstimate) {
          setIsEstimateOutdated(true)
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
      // Dismiss the large video upload toast if it exists
      if (isLargeVideo) {
        toast.dismiss('large-video-upload');
      }
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    // Import and use the deleteFile serverAction
    const { deleteFile } = await import('./actions');

    // Call the server action
    const result = await deleteFile(fileId);

    if (result.error) {
      toast.error(`Failed to delete file: ${result.error}`);
      return;
    }

    // Update UI state
    setUploadedFiles(files => files.filter(f => f.id !== fileId));

    // Also remove any child files from aiGeneratedFiles state
    setAiGeneratedFiles(files => files.filter(f => f.parent_file_id !== fileId));

    toast.success('File deleted successfully');

    // Mark estimate as outdated if it exists
    if (aiEstimate) {
      setIsEstimateOutdated(true);
    }
  }

  const handleGenerateEstimate = async () => {
    if (uploadedFiles.length === 0) {
      toast.error('No files to process')
      return
    }

    setEstimateStatus('processing');
    setEstimateError(null);
    toast.info('Starting estimate generation...');
    
    try {
      // Start the background job
      const result = await startEstimateGeneration(id);
      
      if (!result.success) {
        setEstimateStatus('failed');
        setEstimateError(result.error || 'Failed to start estimate generation');
        
        // Show detailed errors for failed files
        if (result.failedFiles && result.failedFiles.length > 0) {
          // It seems result.failedFiles is FileToProcess[], ensure name exists.
          const failedFileNames = result.failedFiles.map((f: any) => f.name).join(', ');
          toast.error(`Failed to process files: Could not fetch content for ${failedFileNames}`, {
            duration: 5000,
          });
          
          // Show individual errors
          result.failedFiles.forEach((file: any) => {
            if (file.error) {
              toast.error(`${file.name}: ${file.error}`, {
                duration: 5000,
              });
            }
          });
        } else {
          toast.error(`Failed to start processing: ${result.error}`);
        }
      } else {
        toast.success('Estimate generation started');
      }
    } catch (error) {
      console.error('Error starting estimate generation:', error);
      toast.error(`Failed to start estimate generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setEstimateStatus('failed');
      setEstimateError(error instanceof Error ? error.message : 'Unknown error');
    }
  };
  
  const handleAddNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;

    setIsAddingNote(true);
    try {
      // Create the note content
      const noteText = `# ${noteTitle}\n\n${noteContent}`;
      const fileName = `${noteTitle.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
      
      // Create a text encoder to convert the note text to a Uint8Array
      const encoder = new TextEncoder();
      const noteData = encoder.encode(noteText);
      
      // Create form data with the raw data
      const formData = new FormData();
      // Create a blob with the note content and use it directly
      const blob = new Blob([noteData], { type: 'text/markdown' });
      // Use the blob as a file with a custom name
      formData.append('file', blob, fileName);
      formData.append('description', 'Project note');
      
      // Upload the note as a file
      const result = await uploadFile(formData, id);
      
      if (result.error) {
        toast.error(`Failed to add note: ${result.error}`);
      } else {
        toast.success('Note added successfully');
        setNoteDialogOpen(false);
        setNoteTitle("");
        setNoteContent("");
        fetchFiles(); // Refresh the files list
        
        // Mark estimate as outdated if it exists
        if (aiEstimate) {
          setIsEstimateOutdated(true);
        }
      }
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const isMarkdownFile = (fileName: string) => {
    return fileName.endsWith('.md') || fileName.endsWith('.markdown');
  };

  // Function to get a signed URL for a file (for images in the UI)
  const getFileSignedUrl = async (file: UploadedFile) => {
    if (!file.file_url) {
      return '';
    }
    
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET_NAME)
        .createSignedUrl(file.file_url, 3600); // 1 hour expiration
      
      if (error) {
        console.error('Error creating signed URL:', error);
        return '';
      }
      
      return data.signedUrl;
    } catch (error) {
      console.error('Error creating signed URL:', error);
      return '';
    }
  };

  const handleStartVideoProcessing = async (fileId: string) => {
    try {
      const startResult = await startVideoProcessing(id, fileId);
      if (startResult.error) {
        toast.error(`Failed to start video processing: ${startResult.error}`);
      } else {
        toast.success('Video processing started');
        // Add to processing videos immediately for better UX
        setProcessingVideoIds(prev => ({ ...prev, [fileId]: startResult.jobId || 'pending' }));
        // Refresh after a delay to get latest status
        setTimeout(() => {
          fetchFiles();
        }, 2000);
      }
    } catch (error) {
      console.error('Error starting video processing:', error);
      toast.error('Failed to start video processing');
    }
  };

  const handleFileClick = async (file: UploadedFile, e: React.MouseEvent) => {
    e.preventDefault();

    // Set the file to preview
    setPreviewFile(file);
    setFileContent(null);
    setSignedImageUrl('');
    setSignedAudioUrl('');
    setFilePreviewDialogOpen(true);

    // If it's an image file, get the signed URL
    if (isImageFile(file.file_name)) {
      const url = await getFileSignedUrl(file);
      setSignedImageUrl(url);
    }
    // If it's an audio file, get the signed URL
    else if (isAudioFile(file.file_name)) {
      const url = await getFileSignedUrl(file);
      setSignedAudioUrl(url);
    }
    // Only attempt to load content for text files
    else if (isTextFile(file.file_name)) {
      setIsLoadingPreview(true);
      try {
        // Use the stored file path if available
        const filePath = file.file_url;

        if (!filePath) {
          toast.error('File path not available. This file may need to be re-uploaded.');
          setIsLoadingPreview(false);
          return;
        }

        // Create a signed URL for the file
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET_NAME)
          .createSignedUrl(filePath, 3600); // 1 hour expiration

        if (error) {
          console.error(`Error creating signed URL for ${file.file_name}:`, error);
          toast.error('Failed to generate secure access link');
          setIsLoadingPreview(false);
          return;
        }

        // Fetch the content using the signed URL
        const response = await fetch(data.signedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }

        // Convert the response to text
        const content = await response.text();
        setFileContent(content);
      } catch (error) {
        console.error('Error loading file preview:', error);
        toast.error('Failed to load file preview');
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const isTextFile = (fileName: string) => {
    return fileName.endsWith('.txt') || fileName.endsWith('.md') ||
           fileName.endsWith('.js') || fileName.endsWith('.ts') ||
           fileName.endsWith('.jsx') || fileName.endsWith('.tsx') ||
           fileName.endsWith('.html') || fileName.endsWith('.css') ||
           fileName.endsWith('.json') || fileName.endsWith('.csv');
  };

  const isImageFile = (fileName: string) => {
    return fileName.match(/\.(jpeg|jpg|png|gif|webp|svg)$/i) !== null;
  };

  const isAudioFile = (fileName: string) => {
    return fileName.match(/\.(mp3|wav|ogg|m4a|aac)$/i) !== null;
  };

  const isVideoFile = (fileName: string) => {
    return fileName.match(/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv|m4v)$/i) !== null;
  };

  const handleClearProjectInfo = async () => {
    if (confirm("Are you sure you want to clear the project overview? This action cannot be undone.")) {
      try {
        const result = await clearProjectInfo(id);
        
        if (result.error) {
          toast.error(`Failed to clear project overview: ${result.error}`);
        } else {
          toast.success('Project overview cleared successfully');
          setProjectInfo(''); // Update the UI immediately
        }
      } catch (error) {
        console.error('Error clearing project overview:', error);
        toast.error('Failed to clear project overview');
      }
    }
  };

  const handleClearProjectEstimate = async () => {
    if (confirm("Are you sure you want to clear the construction estimate? This action cannot be undone.")) {
      try {
        const result = await clearProjectEstimate(id);
        
        if (result.error) {
          toast.error(`Failed to clear construction estimate: ${result.error}`);
        } else {
          toast.success('Construction estimate cleared successfully');
          setAiEstimate(null); // Update the UI immediately
          setIsEstimateOutdated(false); // Reset the outdated state
        }
      } catch (error) {
        console.error('Error clearing construction estimate:', error);
        toast.error('Failed to clear construction estimate');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-128px)]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-2 text-lg">Loading project data...</p>
      </div>
    );
  }

  // Main component render
  return (
    <div className="container mx-auto p-0 max-w-none">
      {/* Top Bar Controls - Include Project Name and Generate Estimate Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center">
          <Link href="/dashboard" className="mr-4 p-2 rounded-md hover:bg-gray-700">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-3xl font-bold text-white">{project?.name || "Project Details"}</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
          <Button 
            onClick={handleGenerateEstimate} 
            disabled={estimateStatus === 'processing' || uploadedFiles.length === 0}
            className={`w-full sm:w-auto text-white transition-all duration-150 ease-in-out transform active:scale-95 flex items-center justify-center py-3 px-6 rounded-lg shadow-md whitespace-nowrap ${isEstimateOutdated ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {estimateStatus === 'processing' ? (
              <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Processing...</>
            ) : isEstimateOutdated ? (
              <><RefreshCw className="mr-2 h-5 w-5" />Regenerate Estimate</>
            ) : (
              <><Play className="mr-2 h-5 w-5" />Generate Estimate</>
            )}
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 gap-6">
        <div>
          {/* 
            NOTE: handleEstimateUpdateTriggered is now passed via ViewContext 
            in app-client-shell.tsx to the ChatPanel.
          */}
          {/* Existing view logic based on currentProjectView */}
          {currentProjectView === 'estimate' && (
            <div className="estimate-view space-y-6">
              {estimateStatus === 'processing' ? (
                <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center min-h-[400px] flex flex-col justify-center items-center">
                  <RefreshCw className="h-12 w-12 animate-spin text-blue-500 mb-4" />
                  <h2 className="text-xl font-semibold text-gray-200 mb-2">Generating Estimate</h2>
                  <p className="text-gray-300 text-sm max-w-md text-center">Analyzing files... This may take a moment.</p>
                </div>
              ) : estimateStatus === 'failed' && estimateError ? (
                <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center min-h-[400px] flex flex-col justify-center items-center">
                  <div className="text-red-500 mb-4"><TriangleAlert className="h-12 w-12" /></div>
                  <h2 className="text-xl font-semibold text-gray-200 mb-2">Estimate Generation Failed</h2>
                  <p className="text-red-400 text-sm max-w-md text-center mb-4">{estimateError}</p>
                  <Button onClick={() => { setEstimateStatus('not_started'); setEstimateError(null); }} className="bg-blue-600 hover:bg-blue-700">
                    Try Again
                  </Button>
                </div>
              ) : aiEstimate ? (
                <div className="space-y-5">
                  {isEstimateOutdated && (
                    <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 flex items-center">
                      <RefreshCw className="h-5 w-5 text-yellow-400 mr-3 animate-spin" />
                      <div>
                        <h3 className="text-yellow-400 font-medium">Estimate may be outdated</h3>
                        <p className="text-gray-300 text-sm">Files have changed. Regenerate estimate for updates.</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Estimate Overview Section from original component */}
                  <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold">Estimate Overview</h2>
                      <Button variant="ghost" size="sm" onClick={handleClearProjectEstimate} className="text-gray-400 hover:text-red-400 p-0 h-auto">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <div className={`bg-gray-900/50 p-4 rounded-lg border border-gray-700 ${
                          patchedFields.some(path => path.includes('estimated_total_min') || path.includes('estimated_total_max'))
                            ? 'flash-highlight' : ''
                        }`}>
                        <h4 className="text-sm font-medium text-gray-400 mb-1">Estimated Cost Range</h4>
                        <p className="text-xl font-bold text-green-400">
                          ${aiEstimate.estimated_total_min?.toLocaleString() ?? 'N/A'} - ${aiEstimate.estimated_total_max?.toLocaleString() ?? 'N/A'}
                        </p>
                      </div>
                      <div className={`bg-gray-900/50 p-4 rounded-lg border border-gray-700 ${
                          patchedFields.some(path => path.includes('estimated_timeline_days'))
                            ? 'flash-highlight' : ''
                        }`}>
                        <h4 className="text-sm font-medium text-gray-400 mb-1">Estimated Timeline</h4>
                        <p className="text-xl font-bold text-blue-400">
                          {aiEstimate.estimated_timeline_days ? `${aiEstimate.estimated_timeline_days} days` : 'Not specified'}
                        </p>
                      </div>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Project Description</h3>
                      <div className={`text-gray-300 bg-gray-900/30 p-3 rounded-lg border border-gray-700 text-sm prose prose-sm prose-invert max-w-none ${
                          patchedFields.some(path => path.includes('project_description'))
                            ? 'flash-highlight' : ''
                        }`}>
                         <ReactMarkdown>{aiEstimate.project_description}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Key Considerations</h3>
                      <ul className="space-y-1 text-sm list-disc list-inside pl-1">
                        {aiEstimate.key_considerations?.length > 0 ? (
                          aiEstimate.key_considerations.map((consideration: string | null, index: number) => (
                            <li key={index} className="text-gray-300">{consideration}</li>
                          ))
                        ) : (
                          <li className="text-gray-500">No key considerations provided</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Confidence Level</h3>
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${aiEstimate.confidence_level.includes('High') ? 'bg-green-900/50 text-green-400' : aiEstimate.confidence_level.includes('Medium') ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400'}`}>
                        {aiEstimate.confidence_level}
                      </div>
                    </div>
                  </div>

                  {/* Estimate Details Table from original component */}
                  <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                    <h2 className="text-lg font-semibold mb-4">Estimate Details</h2>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left pb-3 text-gray-400 font-medium">Item</th>
                            <th className="text-left pb-3 text-gray-400 font-medium">Category</th>
                            <th className="text-right pb-3 text-gray-400 font-medium">Quantity</th>
                            <th className="text-right pb-3 text-gray-400 font-medium">Cost Range</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {aiEstimate.estimate_items?.length > 0 ? (
                            aiEstimate.estimate_items.map((item: EstimateLineItem, index: number) => (
                              <tr
                                key={index}
                                className={`hover:bg-gray-700/20 ${
                                  // Apply flash animation if this line item was patched
                                  item.uid && patchedFields.some(path => path.includes(item.uid)) ? 'flash-highlight' : ''
                                }`}
                              >
                                <td className="py-3 pr-4">
                                  <div className="font-medium text-gray-200">{item.description}</div>
                                  {item.notes && <div className="text-xs text-gray-400 mt-1 prose prose-xs prose-invert max-w-none"><ReactMarkdown>{item.notes}</ReactMarkdown></div>}
                                </td>
                                <td className="py-3 text-gray-400">
                                  {item.category}
                                  {item.subcategory && <span className="text-xs block text-gray-500">{item.subcategory}</span>}
                                </td>
                                <td className="py-3 text-right text-gray-300">
                                  {item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}
                                </td>
                                <td className="py-3 text-right font-medium text-green-400">
                                  ${item.cost_range_min.toLocaleString()} - ${item.cost_range_max.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan={4} className="py-4 text-center text-gray-500">No estimate items available</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-700">
                            <td colSpan={3} className="py-3 text-right font-medium">Total Estimate</td>
                            <td className="py-3 text-right font-bold text-green-400">
                              ${aiEstimate.estimated_total_min?.toLocaleString() ?? 'N/A'} - ${aiEstimate.estimated_total_max?.toLocaleString() ?? 'N/A'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                  {/* Other sections like Next Steps, Risks, Missing Info from original component */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                      <h2 className="text-lg font-semibold mb-3">Next Steps</h2>
                      <ul className="space-y-2 list-decimal list-inside pl-1">
                        {aiEstimate.next_steps?.length > 0 ? aiEstimate.next_steps.map((step: string | null, index: number) => (<li key={index} className="text-sm text-gray-300">{step}</li>)) : <li className="text-gray-500">No next steps.</li>}
                      </ul>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                      <h2 className="text-lg font-semibold mb-3">Key Risks</h2>
                      <ul className="space-y-2 list-disc list-inside pl-1">
                        {aiEstimate.key_risks?.length > 0 ? aiEstimate.key_risks.map((risk: string | null, index: number) => (<li key={index} className="text-sm text-gray-300">{risk}</li>)) : <li className="text-gray-500">No risks identified.</li>}
                      </ul>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                      <h2 className="text-lg font-semibold mb-3 flex items-center">
                        <span>Missing Information</span>
                        {aiEstimate.missing_information?.length > 0 && <span className="ml-2 bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full">{aiEstimate.missing_information.length} items</span>}
                      </h2>
                      <ul className="space-y-2 list-disc list-inside pl-1">
                        {aiEstimate.missing_information?.length > 0 ? aiEstimate.missing_information.map((item: string | null, index: number) => (<li key={index} className="text-sm text-gray-300">{item}</li>)) : <li className="text-gray-500">No missing info.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 border-dashed text-center min-h-[400px] flex flex-col justify-center items-center">
                  <FileText className="h-12 w-12 text-blue-400 mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No Estimate Generated Yet</h2>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">Upload project files and click "Generate Estimate".</p>
                  <Button onClick={handleGenerateEstimate} className={`text-white ${isEstimateOutdated ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`} disabled={uploadedFiles.length === 0}>
                    <Play className="mr-2 h-4 w-4" /> Generate Estimate
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentProjectView === 'files' && (
            <div className="files-view">
              {/* File Management Section from original component */}
              <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Project Files</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700" onClick={() => setNoteDialogOpen(true)}>
                      <StickyNote className="h-3.5 w-3.5 mr-1.5" /> Add Note
                    </Button>
                    <Input type="file" onChange={handleFileSelect} className="hidden" id="file-upload-input-main" disabled={isUploading} />
                    <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700" disabled={isUploading} onClick={() => document.getElementById('file-upload-input-main')?.click()}>
                      {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />} Upload File
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border-none text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                      onClick={() => setShowAiFiles(!showAiFiles)}
                    >
                      {showAiFiles ? (
                        <><EyeOff className="h-3.5 w-3.5 mr-1.5" /> Hide AI Files</>
                      ) : (
                        <><Eye className="h-3.5 w-3.5 mr-1.5" /> Show AI Files</>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                  {uploadedFiles.length === 0 ? (
                    <div className="text-gray-400 text-center py-8 border border-dashed border-gray-700 rounded-lg">
                      <p className="text-sm mb-2">No files uploaded for this project.</p>
                      <p className="text-xs">Upload construction plans, images, or notes.</p>
                    </div>
                  ) : (
                    <>
                      {/* User uploaded files */}
                      {uploadedFiles.map((file) => {
                        const isProcessing = !!processingVideoIds[file.id];
                        const processingError = videoProcessingErrors[file.id];
                        const isVideo = file.type?.startsWith('video/');

                        // If the file is a video with processing jobs, first find AI summary and frames
                        let videoSummaryFile = null;
                        let videoFrames: UploadedFile[] = [];

                        if (isVideo && (isProcessing || processingError || file.type?.startsWith('video/'))) {
                          // Find summary file and frames
                          videoSummaryFile = aiGeneratedFiles.find(aiFile =>
                            aiFile.parent_file_id === file.id &&
                            aiFile.file_name.includes('summary')
                          );

                          // Get frames and log them for debugging
                          videoFrames = aiGeneratedFiles.filter(aiFile => {
                            const isFrame = aiFile.parent_file_id === file.id &&
                                           !aiFile.file_name.includes('summary') &&
                                           isImageFile(aiFile.file_name);
                            return isFrame;
                          });

                        }

                        // Using hooks from component level

                        // Check if this file is expanded
                        const isExpanded = file.id === expandedVideoId;

                        // Has a summary that could be expanded
                        const hasExpandableContent = isVideo && !isProcessing && !processingError && videoSummaryFile;

                        return (
                          <React.Fragment key={file.id}>
                            <div className="flex flex-col bg-gray-700/30 hover:bg-gray-700/50 rounded-md overflow-hidden transition-colors">
                              {/* File item header */}
                              <div className="flex items-center justify-between p-3">
                                <div className="flex items-center overflow-hidden flex-grow">
                                  {isMarkdownFile(file.file_name) && file.description === 'Project note' ? (
                                    <StickyNote className="mr-2 h-4 w-4 text-yellow-400 flex-shrink-0" />
                                  ) : isImageFile(file.file_name) ? (
                                    <File className="mr-2 h-4 w-4 text-purple-400 flex-shrink-0" />
                                  ) : isAudioFile(file.file_name) ? (
                                    <Music className="mr-2 h-4 w-4 text-green-400 flex-shrink-0" />
                                  ) : isVideo ? (
                                    <Video className="mr-2 h-4 w-4 text-blue-400 flex-shrink-0" />
                                  ) : (
                                    <File className="mr-2 h-4 w-4 text-blue-400 flex-shrink-0" />
                                  )}

                                  <button
                                    onClick={(e) => hasExpandableContent ? toggleVideoExpansion(file.id, e) : handleFileClick(file, e)}
                                    className="text-gray-200 hover:text-blue-400 bg-transparent border-0 p-0 cursor-pointer truncate text-sm"
                                  >
                                    {file.file_name}
                                  </button>

                                  {/* Status indicators for video files */}
                                  {isVideo && (
                                    <div className="ml-2 flex">
                                      {isProcessing ? (
                                        <Badge variant="outline" className="ml-2 bg-blue-900/30 text-blue-400 border-blue-700 flex items-center">
                                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processing
                                        </Badge>
                                      ) : processingError ? (
                                        <div className="flex items-center">
                                          <Badge variant="outline" className="ml-2 bg-red-900/30 text-red-400 border-red-700">
                                            Failed
                                          </Badge>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartVideoProcessing(file.id);
                                            }}
                                            className="ml-2 p-1 h-6 text-blue-400 hover:text-blue-300"
                                          >
                                            Retry
                                          </Button>
                                        </div>
                                      ) : videoSummaryFile ? (
                                        <Badge variant="outline" className="ml-2 bg-green-900/30 text-green-400 border-green-700">
                                          Analyzed
                                        </Badge>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartVideoProcessing(file.id);
                                          }}
                                          className="ml-2 p-1 h-6 text-blue-400 hover:text-blue-300 flex items-center"
                                        >
                                          <Video className="h-3 w-3 mr-1" /> Analyze
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Right side controls - chevron for expandable items + delete button */}
                                <div className="flex items-center">
                                  {hasExpandableContent && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => toggleVideoExpansion(file.id, e)}
                                      className="text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 p-1 h-auto mr-1"
                                    >
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </Button>
                                  )}
                                  {/* Delete File Confirmation Dialog */}
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 p-1 h-auto"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-gray-800 border-gray-700">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="text-white">Delete File</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-300">
                                          Are you sure you want to delete "{file.file_name}"?
                                          {isVideo && videoSummaryFile && (
                                            <span className="block mt-2 text-yellow-400">
                                              This will also delete all AI-generated content associated with this video.
                                            </span>
                                          )}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600">
                                          Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-red-600 hover:bg-red-700 text-white"
                                          onClick={() => handleDeleteFile(file.id)}
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>

                              {/* Expandable content */}
                              {isVideo && !isProcessing && !processingError && videoSummaryFile && isExpanded && (
                                <div className="px-3 pb-3">
                                  <VideoSummaryCard
                                    videoId={file.id}
                                    videoFileName={file.file_name}
                                    summaryFile={videoSummaryFile}
                                    frames={videoFrames.map(frame => {
                                      return {
                                        id: frame.id,
                                        file_name: frame.file_name,
                                        description: frame.description || '',
                                        file_url: frame.file_url
                                      };
                                    })}
                                    isCollapsible={false}
                                    storageBucket={STORAGE_BUCKET_NAME}
                                  />
                                </div>
                              )}

                              {/* Processing indicator for videos being analyzed */}
                              {isVideo && isProcessing && (
                                <div className="px-3 pb-3">
                                  <VideoSummaryCard
                                    videoId={file.id}
                                    videoFileName={file.file_name}
                                    summaryFile={null}
                                    frames={[]}
                                    isProcessing={true}
                                    isCollapsible={false}
                                    storageBucket={STORAGE_BUCKET_NAME}
                                  />
                                </div>
                              )}

                              {/* Error indicator for failed video processing */}
                              {isVideo && processingError && (
                                <div className="px-3 pb-3">
                                  <VideoSummaryCard
                                    videoId={file.id}
                                    videoFileName={file.file_name}
                                    summaryFile={null}
                                    frames={[]}
                                    processingError={processingError}
                                    isCollapsible={false}
                                    storageBucket={STORAGE_BUCKET_NAME}
                                  />
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}

                      {/* AI-generated files that aren't explicitly linked to videos */}
                      {showAiFiles && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center">
                            AI-Generated Files
                            <Badge className="ml-2 bg-purple-900/30 text-purple-400 border-purple-700">
                              {aiGeneratedFiles.length}
                            </Badge>
                          </h3>

                          {aiGeneratedFiles.length === 0 ? (
                            <div className="text-gray-500 text-sm text-center py-3">
                              No AI-generated files available
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Only show AI files that don't have a parent already in the list */}
                              {aiGeneratedFiles
                                .filter(file => {
                                  // Skip files that are already shown in VideoSummaryCards
                                  const parentIsDisplayedVideo = !!uploadedFiles.find(parentFile =>
                                    parentFile.id === file.parent_file_id &&
                                    parentFile.type?.startsWith('video/')
                                  );
                                  return !parentIsDisplayedVideo;
                                })
                                .map(file => (
                                  <div key={file.id} className="flex items-center justify-between bg-gray-700/20 hover:bg-gray-700/40 p-3 rounded-md transition-colors">
                                    <div className="flex items-center overflow-hidden">
                                      {isImageFile(file.file_name) ? (
                                        <File className="mr-2 h-4 w-4 text-purple-400 flex-shrink-0" />
                                      ) : isTextFile(file.file_name) ? (
                                        <FileText className="mr-2 h-4 w-4 text-blue-400 flex-shrink-0" />
                                      ) : (
                                        <File className="mr-2 h-4 w-4 text-gray-400 flex-shrink-0" />
                                      )}
                                      <button
                                        onClick={(e) => handleFileClick(file, e)}
                                        className="text-gray-300 hover:text-blue-400 bg-transparent border-0 p-0 cursor-pointer truncate text-sm"
                                      >
                                        {file.file_name}
                                      </button>
                                      <Badge variant="outline" className="ml-2 bg-purple-900/30 text-purple-400 border-purple-700">
                                        AI
                                      </Badge>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteFile(file.id)}
                                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 ml-1 p-1 h-auto"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload File Dialog - Corrected Usage */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        if (!isUploading) {
          setUploadDialogOpen(open);
        } else if (!open) {
          // If trying to close while uploading, show warning
          toast.error('Upload in progress. Please wait until it completes.');
        }
      }}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Select a file and add a description.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* File selection area */}
            <div className="grid grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor="file-upload-input" className="text-right">
                File <span className="text-red-400 font-bold">*</span>
              </Label>
              <div className="col-span-3">
                {fileToUpload ? (
                  <div className="p-3 bg-gray-700/50 rounded-md border border-gray-600 flex items-center">
                    {fileToUpload.type?.startsWith('image/') ? (
                      <File className="h-6 w-6 text-purple-400 mr-3 flex-shrink-0" />
                    ) : fileToUpload.type?.startsWith('video/') ? (
                      <Video className="h-6 w-6 text-blue-400 mr-3 flex-shrink-0" />
                    ) : fileToUpload.type?.startsWith('audio/') ? (
                      <Music className="h-6 w-6 text-green-400 mr-3 flex-shrink-0" />
                    ) : (
                      <File className="h-6 w-6 text-gray-400 mr-3 flex-shrink-0" />
                    )}
                    <div className="overflow-hidden flex-1">
                      <p className="text-sm text-white truncate font-medium">{fileToUpload.name}</p>
                      <p className="text-xs text-gray-400">
                        {(fileToUpload.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-1 text-gray-400 hover:text-gray-300 flex-shrink-0"
                      onClick={() => setFileToUpload(null)}
                      type="button"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 w-full flex justify-center py-2"
                      onClick={() => document.getElementById('hidden-file-input')?.click()}
                      disabled={isUploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Select File
                    </Button>
                    <input
                      id="hidden-file-input"
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const selectedFile = e.target.files ? e.target.files[0] : null;
                        if (selectedFile) {
                          setFileToUpload(selectedFile);

                          // Show info about large video files
                          if (selectedFile.type?.startsWith('video/')) {
                            const fileSizeMB = selectedFile.size / (1024 * 1024);
                            if (fileSizeMB > 30) {
                              toast.info(`Large video file selected (${fileSizeMB.toFixed(1)}MB). Upload and processing may take some time.`);
                            }
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Description text area - spacing adjusted */}
            <div className="grid grid-cols-4 items-start gap-4 mb-4">
              <Label htmlFor="file-description" className="text-right pt-2">
                <span className="text-red-400 font-bold mr-1">*</span>Description
              </Label>
              <div className="col-span-3">
                <div className="relative">
                  <textarea
                    id="file-description"
                    value={fileDescription}
                    onChange={(e) => setFileDescription(e.target.value)}
                    placeholder="Describe the file content (required)"
                    className="w-full bg-gray-700 border-gray-600 text-white p-3 rounded-md text-sm"
                    rows={6}
                    disabled={isUploading}
                  />
                </div>
                <p className="text-xs text-red-400/80 mt-1">Required field</p>
              </div>
            </div>

            {/* Video processing info box removed */}

            {/* Clean upload confirmation screen */}
            {isUploading && (
              <div className="fixed inset-0 z-50 bg-gray-900/90 flex flex-col items-center justify-center">
                <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 shadow-lg max-w-md w-full text-center">
                  <RefreshCw className="h-10 w-10 mb-4 mx-auto animate-spin text-blue-400" />
                  <h3 className="text-xl font-medium text-white mb-2">Uploading File</h3>
                  <p className="text-gray-300 mb-6">
                    {fileToUpload?.name && (
                      <span className="block font-mono text-sm mt-1 text-blue-300 truncate max-w-full">
                        {fileToUpload.name}
                      </span>
                    )}
                  </p>
                  <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
                    <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                  </div>
                  <p className="text-sm text-gray-400">
                    Please keep this window open until the upload completes...
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              className="text-gray-300 border-gray-600 hover:bg-gray-700"
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={isUploading || !fileToUpload || !fileDescription}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUploading ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                'Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog - Corrected Usage */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Add a Note</DialogTitle>
            <DialogDescription>
              Create a quick note. It will be saved as a Markdown file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="note-title" className="text-right">
                Title
              </Label>
              <Input 
                id="note-title" 
                value={noteTitle} 
                onChange={(e) => setNoteTitle(e.target.value)} 
                placeholder="Note Title (e.g., Initial Measurements)" 
                className="col-span-3 bg-gray-700 border-gray-600"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="note-content" className="text-right">
                Content
              </Label>
              <Textarea 
                id="note-content" 
                value={noteContent} 
                onChange={(e) => setNoteContent(e.target.value)} 
                placeholder="Write your note here... Supports Markdown." 
                className="col-span-3 bg-gray-700 border-gray-600 h-32"
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)} className="text-gray-300 border-gray-600 hover:bg-gray-700">Cancel</Button>
            <Button onClick={handleAddNote} disabled={isAddingNote || !noteTitle.trim() || !noteContent.trim()} className="bg-blue-600 hover:bg-blue-700">
              {isAddingNote ? 'Adding Note...' : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* File Preview Dialog - Corrected Usage */}
      {previewFile && (
        <Dialog open={filePreviewDialogOpen} onOpenChange={setFilePreviewDialogOpen}>
          <DialogContent className="bg-gray-800 text-white border-gray-700 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                {previewFile && isAudioFile(previewFile.file_name) ? <Music className="mr-2 h-5 w-5 text-green-400" /> :
                 previewFile && isImageFile(previewFile.file_name) ? <File className="mr-2 h-5 w-5 text-purple-400" /> :
                 <FileText className="mr-2 h-5 w-5 text-blue-400" />}
                {previewFile?.file_name}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 flex-grow overflow-auto">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="animate-spin mr-2 h-6 w-6" /> 
                  <span>Loading file content...</span>
                </div>
              ) : (
                <>
                  {previewFile && isImageFile(previewFile.file_name) ? (
                    <div className="flex justify-center">
                      {previewFile.file_url ? (
                        signedImageUrl ? (
                          <Image 
                            src={signedImageUrl} 
                            alt={previewFile.file_name} 
                            width={800}
                            height={600}
                            className="max-h-[60vh] object-contain"
                            unoptimized // if using external Supabase URLs without Next.js image optimization configured for them
                          />
                        ) : (
                          <div className="text-center text-gray-400">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                            Loading image...
                          </div>
                        )
                      ) : (
                        <div className="text-center text-gray-400">
                          Image path not available. This file may need to be re-uploaded.
                        </div>
                      )}
                    </div>
                  ) : previewFile && isAudioFile(previewFile.file_name) ? (
                    <div className="flex justify-center p-4">
                      {signedAudioUrl ? (
                        <audio controls src={signedAudioUrl} className="w-full max-w-md">
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <div className="text-center text-gray-400">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          Loading audio...
                        </div>
                      )}
                    </div>
                  ) : previewFile && isTextFile(previewFile.file_name) ? (
                    fileContent ? (
                      <div className="bg-gray-900 p-4 rounded overflow-auto max-h-[60vh]">
                        {isMarkdownFile(previewFile.file_name) ? (
                          <div className="prose prose-invert max-w-none">
                            <ReactMarkdown>{fileContent}</ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words text-sm text-gray-300">
                            {fileContent}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-gray-400">
                        Failed to load file content or content is empty.
                      </div>
                    )
                  ) : (
                    <div className="text-center text-gray-400">
                      This file type cannot be previewed directly. You can download it to view.
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter className="flex justify-between items-center pt-4 border-t border-gray-700">
              <div>
                {previewFile && previewFile.file_url && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (previewFile && previewFile.file_url) {
                        try {
                          const { data, error } = await supabase.storage
                            .from(STORAGE_BUCKET_NAME)
                            .createSignedUrl(previewFile.file_url, 60, { download: true });
                          if (error) throw error;
                          window.open(data.signedUrl, '_blank');
                          toast.success('File download initiated');
                        } catch (err) {
                          console.error('Error downloading file:', err);
                          toast.error('Failed to download file');
                        }
                      }
                    }}
                    className="inline-flex items-center text-blue-400 hover:text-blue-300 border-blue-400/50 hover:border-blue-400/80 mr-4"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                )}
              </div>
              <Button 
                onClick={() => setFilePreviewDialogOpen(false)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


function CollapsibleMarkdown({ content }: { content: string }) {
  // Parse the markdown content to identify headers
  const [sections, setSections] = useState<Array<{
    id: string;
    level: number;
    title: string;
    content: string;
    isOpen: boolean;
  }>>([]);

  useEffect(() => {
    // Parse the markdown to identify headers and their content
    const lines = content.split('\n');
    const parsedSections: Array<{
      id: string;
      level: number;
      title: string;
      content: string;
      isOpen: boolean;
    }> = [];
    
    let currentSection: {
      id: string;
      level: number;
      title: string;
      content: string;
      isOpen: boolean;
    } | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        // If we already have a section, push it to the array
        if (currentSection) {
          parsedSections.push(currentSection);
        }
        
        // Create a new section
        const level = headerMatch[1].length;
        const title = headerMatch[2];
        const id = title.toLowerCase().replace(/[^\w]+/g, '-');
        
        currentSection = {
          id,
          level,
          title,
          content: line,
          isOpen: level === 1 // Only top-level headers are open by default
        };
      } else if (currentSection) {
        // Add this line to the current section
        currentSection.content += '\n' + line;
      } else {
        // If there's content before any header, create a default section
        currentSection = {
          id: 'introduction',
          level: 0,
          title: 'Introduction',
          content: line,
          isOpen: true
        };
      }
    }
    
    // Don't forget to add the last section
    if (currentSection) {
      parsedSections.push(currentSection);
    }
    
    setSections(parsedSections);
  }, [content]);

  const toggleSection = (id: string) => {
    setSections(prevSections => 
      prevSections.map(section => 
        section.id === id 
          ? { ...section, isOpen: !section.isOpen } 
          : section
      )
    );
  };

  if (sections.length === 0) {
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <div key={section.id} className="mb-2">
          {section.level > 0 && (
            <div 
              className="flex items-center cursor-pointer hover:bg-gray-700/50 p-1 rounded transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              {section.isOpen ? (
                <ChevronDown className="h-4 w-4 mr-2 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2 text-gray-400" />
              )}
              <div className={`font-semibold ${
                section.level === 1 ? 'text-xl' : 
                section.level === 2 ? 'text-lg' : 
                section.level === 3 ? 'text-base' : 
                'text-sm'
              }`}>
                {section.title}
              </div>
            </div>
          )}
          {(section.isOpen || section.level === 0) && (
            <div className={section.level > 0 ? "pl-6 mt-2" : ""}>
              <ReactMarkdown>
                {section.level > 0 
                  ? section.content.replace(/^(#{1,6})\s+(.+)$/, '') // Remove the header line
                  : section.content
                }
              </ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

