"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, Upload, File, ArrowLeft, FileText, Play, ChevronDown, ChevronRight, StickyNote, ExternalLink, Download, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { uploadFile, processFiles, updateProjectInfo, clearProjectInfo, clearProjectEstimate, AIEstimate } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import * as DialogPrimitive from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

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
}

interface FileToProcess {
  type: string
  name: string
  content?: string
  description: string
  path?: string
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
  const [chatMessages, setChatMessages] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [projectInfo, setProjectInfo] = useState<string>("")
  const [project, setProject] = useState<Project | null>(null)
  const [aiEstimate, setAiEstimate] = useState<AIEstimate | null>(null)
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
  const [isLoading, setIsLoading] = useState(true)
  const [isEstimateOutdated, setIsEstimateOutdated] = useState(false)
  const [initialFileCount, setInitialFileCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchFiles(), fetchProject()])
      setIsLoading(false)
    }
    
    loadData()
  }, [])

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
    if (initialFileCount !== 0 && uploadedFiles.length !== initialFileCount && aiEstimate) {
      setIsEstimateOutdated(true)
    }
  }, [uploadedFiles, initialFileCount, aiEstimate, isLoading])

  const fetchProject = async () => {
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
      }
    }
  }

  const fetchFiles = async () => {
    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .eq('project_id', id)

    if (error) {
      console.error('Error fetching files:', error)
      return
    }

    setUploadedFiles(files || [])
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    
    setFileToUpload(files[0])
    setUploadDialogOpen(true)
  }

  const handleFileUpload = async () => {
    if (!fileToUpload) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      formData.append('description', fileDescription)
      
      const result = await uploadFile(formData, id)
      
      if (result.error) {
        toast.error(`Failed to upload ${fileToUpload.name}: ${result.error}`)
      } else {
        toast.success(`Successfully uploaded ${fileToUpload.name}`)
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
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId)

    if (error) {
      toast.error('Failed to delete file')
      return
    }

    setUploadedFiles(files => files.filter(f => f.id !== fileId))
    toast.success('File deleted successfully')
    
    // Mark estimate as outdated if it exists
    if (aiEstimate) {
      setIsEstimateOutdated(true)
    }
  }

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault()
    if (newMessage.trim()) {
      setChatMessages([...chatMessages, newMessage])
      setNewMessage("")
    }
  }

  const handleProcessFiles = async () => {
    if (uploadedFiles.length === 0) {
      toast.error('No files to process')
      return
    }

    setIsProcessing(true)
    try {
      toast.info('Preparing files for processing...')
      
      // Prepare files for processing using the stored file paths
      const filesToProcess: FileToProcess[] = uploadedFiles.map((file) => {
        // For text files
        if (file.file_name.endsWith('.txt') || file.file_name.endsWith('.md')) {
          return {
            type: 'text',
            name: file.file_name,
            description: file.description || '',
            path: file.file_url
          };
        }
        // For images
        else if (file.file_name.match(/\.(jpeg|jpg|png|gif)$/i)) {
          return {
            type: 'image',
            name: file.file_name,
            description: file.description || '',
            path: file.file_url
          };
        }
        // For other file types
        return {
          type: 'other',
          name: file.file_name,
          description: file.description || ''
        };
      });
      
      // Check if any files are missing paths
      const missingPaths = filesToProcess.filter(file => 
        (file.type === 'image' || file.type === 'text') && !file.path
      );
      
      if (missingPaths.length > 0) {
        const missingFileNames = missingPaths.map(f => f.name).join(', ');
        toast.error(`Missing file paths for: ${missingFileNames}. These files may need to be re-uploaded.`);
        setIsProcessing(false);
        return;
      }

      toast.info('Analyzing files and generating construction estimate...')
      
      // Process files with LangGraph
      const result = await processFiles(id, filesToProcess)
      
      if (result.error) {
        console.error('Error from processFiles:', result.error)
        
        // Check if there are failed files and display more specific error
        if (result.failedFiles && result.failedFiles.length > 0) {
          const failedFileNames = result.failedFiles.map((f: any) => f.name).join(', ');
          toast.error(`Failed to process files: Could not fetch content for ${failedFileNames}`, {
            duration: 5000,
          });
          
          // Show detailed errors for each failed file
          result.failedFiles.forEach((file: any) => {
            if (file.error) {
              toast.error(`${file.name}: ${file.error}`, {
                duration: 5000,
              });
            }
          });
        } else {
          toast.error(`Failed to process files: ${result.error}`);
        }
      } else {
        toast.success('Files processed successfully')
        
        if (result.updated_project_info) {
          setProjectInfo(result.updated_project_info)
          
          // Update project info in the database
          const updateResult = await updateProjectInfo(id, result.updated_project_info)
          
          if (updateResult.error) {
            console.warn('Error updating project info in database:', updateResult.error)
            toast.warning('Project overview generated but could not be saved to database')
          } else {
            toast.success('Project overview updated and saved')
          }
          
          // Refresh project data
          fetchProject()
        } else {
          toast.warning('No project overview was generated')
        }
        
        // Handle the AI estimate if it exists
        if (result.ai_estimate) {
          setAiEstimate(result.ai_estimate)
          toast.success('Construction estimate generated')
          
          // Reset the outdated state and update the initial file count
          setIsEstimateOutdated(false)
          setInitialFileCount(uploadedFiles.length)
        }
      }
    } catch (error) {
      console.error('Error processing files:', error)
      toast.error(`Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

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

  const handleFileClick = async (file: UploadedFile, e: React.MouseEvent) => {
    e.preventDefault();
    
    // Set the file to preview
    setPreviewFile(file);
    setFileContent(null);
    setSignedImageUrl(''); // Reset the signed URL
    setFilePreviewDialogOpen(true);
    
    // If it's an image file, get the signed URL
    if (isImageFile(file.file_name)) {
      const url = await getFileSignedUrl(file);
      setSignedImageUrl(url);
    }
    
    // Only attempt to load content for text files
    if (isTextFile(file.file_name)) {
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin text-blue-500 mb-4">
              <RefreshCw className="h-12 w-12" />
            </div>
            <h2 className="text-xl font-semibold text-gray-300">Loading project data...</h2>
          </div>
        ) : (
          <>
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
                  <h1 className="text-2xl font-bold">{project?.name || 'Project Details'}</h1>
                </div>
                {project && (
                  <p className="text-gray-400 text-sm">{project.description}</p>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <Button 
                  onClick={handleProcessFiles} 
                  className={`${isEstimateOutdated ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} flex items-center gap-2`}
                  disabled={isProcessing || uploadedFiles.length === 0}
                >
                  {isEstimateOutdated && (
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  {!isEstimateOutdated && (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  {isProcessing ? 'Processing...' : isEstimateOutdated ? 'Regenerate Estimate' : 'Generate Estimate'}
                </Button>
              </div>
            </div>

            {/* Main content */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left sidebar - File Management */}
              <div className="md:col-span-1">
                <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Files</h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                        onClick={() => setNoteDialogOpen(true)}
                      >
                        <StickyNote className="h-3.5 w-3.5 mr-1" />
                        Note
                      </Button>
                      <Input 
                        type="file" 
                        onChange={handleFileSelect} 
                        className="hidden"
                        id="file-upload"
                        disabled={isUploading}
                      />
                      <Button 
                        size="sm"
                        variant="outline"
                        className="border-gray-600 text-gray-300 hover:bg-gray-700" 
                        disabled={isUploading}
                        onClick={() => {
                          const fileInput = document.getElementById('file-upload');
                          if (fileInput) {
                            fileInput.click();
                          }
                        }}
                      >
                        {isUploading ? (
                          <span className="animate-spin">⟳</span>
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {uploadedFiles.length === 0 ? (
                      <div className="text-gray-400 text-center py-8 border border-dashed border-gray-700 rounded-lg">
                        <p className="text-sm mb-2">No files yet</p>
                        <p className="text-xs">Upload files or add notes to get started</p>
                      </div>
                    ) : (
                      uploadedFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 p-3 rounded">
                          <div className="flex items-center overflow-hidden">
                            {isMarkdownFile(file.file_name) && file.description === 'Project note' ? (
                              <StickyNote className="mr-2 h-4 w-4 text-yellow-400 flex-shrink-0" />
                            ) : (
                              <File className="mr-2 h-4 w-4 text-blue-400 flex-shrink-0" />
                            )}
                            <button 
                              onClick={(e) => handleFileClick(file, e)}
                              className="text-gray-200 hover:text-blue-400 bg-transparent border-0 p-0 cursor-pointer truncate"
                            >
                              {file.file_name}
                            </button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteFile(file.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20 ml-1 p-0 h-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Project Info */}
                {projectInfo && (
                  <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold">Project Overview</h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearProjectInfo}
                        className="text-gray-400 hover:text-red-400 p-0 h-auto"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="prose prose-invert max-w-none prose-sm max-h-[300px] overflow-y-auto pr-1">
                      <CollapsibleMarkdown content={projectInfo} />
                    </div>
                  </div>
                )}
              </div>

              {/* Right content - AI Estimate */}
              <div className="md:col-span-2 relative">
                {isProcessing && (
                  <div className="absolute inset-0 bg-gray-900/70 z-10 flex flex-col items-center justify-center rounded-lg">
                    <div className="animate-spin text-blue-500 mb-4">
                      <RefreshCw className="h-12 w-12" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-300 mb-2">Generating Estimate</h2>
                    <p className="text-gray-400 text-sm max-w-md text-center">
                      Analyzing your files and creating a detailed construction estimate. This may take a minute...
                    </p>
                  </div>
                )}
                
                {aiEstimate ? (
                  <div className="space-y-5">
                    {isEstimateOutdated && (
                      <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 flex items-center">
                        <RefreshCw className="h-5 w-5 text-yellow-400 mr-3 animate-spin" />
                        <div>
                          <h3 className="text-yellow-400 font-medium">Estimate may be outdated</h3>
                          <p className="text-gray-300 text-sm">Files have been added or removed since this estimate was generated. Click "Regenerate Estimate" above to update.</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Estimate Overview */}
                    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">Estimate Overview</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearProjectEstimate}
                          className="text-gray-400 hover:text-red-400 p-0 h-auto"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-5">
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                          <h4 className="text-sm font-medium text-gray-400 mb-1">Estimated Cost Range</h4>
                          <p className="text-xl font-bold text-green-400">
                            ${aiEstimate.estimated_total_min.toLocaleString()} - ${aiEstimate.estimated_total_max.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                          <h4 className="text-sm font-medium text-gray-400 mb-1">Estimated Timeline</h4>
                          <p className="text-xl font-bold text-blue-400">
                            {aiEstimate.estimated_timeline_days ? `${aiEstimate.estimated_timeline_days} days` : 'Not specified'}
                          </p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Project Description</h3>
                        <p className="text-gray-300 bg-gray-900/30 p-3 rounded-lg border border-gray-700 text-sm">
                          {aiEstimate.project_description}
                        </p>
                      </div>
                      
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Key Considerations</h3>
                        <ul className="space-y-1 text-sm">
                          {aiEstimate.key_considerations?.length > 0 ? (
                            aiEstimate.key_considerations.map((consideration, index) => (
                              <li key={index} className="text-gray-300 flex">
                                <span className="text-blue-400 mr-2">•</span> {consideration}
                              </li>
                            ))
                          ) : (
                            <li className="text-gray-500">No key considerations provided</li>
                          )}
                        </ul>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="text-sm font-medium text-gray-400 mb-2">Confidence Level</h3>
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${aiEstimate.confidence_level.includes('High') ? 'bg-green-900/50 text-green-400' : 
                              aiEstimate.confidence_level.includes('Medium') ? 'bg-yellow-900/50 text-yellow-400' : 
                              'bg-red-900/50 text-red-400'}`}>
                            {aiEstimate.confidence_level}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Estimate Details */}
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
                              aiEstimate.estimate_items.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-700/20">
                                  <td className="py-3 pr-4">
                                    <div className="font-medium text-gray-200">{item.description}</div>
                                    {item.notes && (
                                      <div className="text-xs text-gray-400 mt-1">{item.notes}</div>
                                    )}
                                  </td>
                                  <td className="py-3 text-gray-400">
                                    {item.category}
                                    {item.subcategory && (
                                      <span className="text-xs block text-gray-500">{item.subcategory}</span>
                                    )}
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
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-gray-500">
                                  No estimate items available
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-700">
                              <td colSpan={3} className="py-3 text-right font-medium">Total Estimate</td>
                              <td className="py-3 text-right font-bold text-green-400">
                                ${aiEstimate.estimated_total_min.toLocaleString()} - ${aiEstimate.estimated_total_max.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Next Steps and Risks */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                        <h2 className="text-lg font-semibold mb-3">Next Steps</h2>
                        <ul className="space-y-2">
                          {aiEstimate.next_steps?.length > 0 ? (
                            aiEstimate.next_steps.map((step, index) => (
                              <li key={index} className="flex items-start text-sm">
                                <span className="mr-2 mt-0.5 text-blue-400">{index + 1}.</span>
                                <span className="text-gray-300">{step}</span>
                              </li>
                            ))
                          ) : (
                            <li className="text-gray-500">No next steps provided</li>
                          )}
                        </ul>
                      </div>
                      
                      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                        <h2 className="text-lg font-semibold mb-3">Key Risks</h2>
                        <ul className="space-y-2">
                          {aiEstimate.key_risks?.length > 0 ? (
                            aiEstimate.key_risks.map((risk, index) => (
                              <li key={index} className="flex items-start text-sm">
                                <span className="mr-2 mt-0.5 text-red-400">•</span>
                                <span className="text-gray-300">{risk}</span>
                              </li>
                            ))
                          ) : (
                            <li className="text-gray-500">No key risks identified</li>
                          )}
                        </ul>
                      </div>
                      
                      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
                        <h2 className="text-lg font-semibold mb-3 flex items-center">
                          <span>Missing Information</span>
                          {aiEstimate.missing_information?.length > 0 && (
                            <span className="ml-2 bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                              {aiEstimate.missing_information.length} items
                            </span>
                          )}
                        </h2>
                        <ul className="space-y-2">
                          {aiEstimate.missing_information?.length > 0 ? (
                            aiEstimate.missing_information.map((item, index) => (
                              <li key={index} className="flex items-start text-sm">
                                <span className="mr-2 mt-0.5 text-yellow-400">•</span>
                                <span className="text-gray-300">{item}</span>
                              </li>
                            ))
                          ) : (
                            <li className="text-gray-500">No missing information identified</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 border-dashed text-center">
                    <div className="mb-4">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-900/20 mb-4">
                        <FileText className="h-6 w-6 text-blue-400" />
                      </div>
                      <h2 className="text-xl font-semibold mb-2">No Estimate Generated Yet</h2>
                      <p className="text-gray-400 mb-6 max-w-md mx-auto">
                        Upload your project files and click "Generate Estimate" to create a detailed construction cost estimate.
                      </p>
                    </div>
                    
                    <div className="flex justify-center">
                      <Button 
                        onClick={handleProcessFiles} 
                        className={`${isEstimateOutdated ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} flex items-center gap-2`}
                        disabled={isProcessing || uploadedFiles.length === 0}
                      >
                        {isEstimateOutdated && (
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        {!isEstimateOutdated && (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        {isProcessing ? 'Processing...' : isEstimateOutdated ? 'Regenerate Estimate' : 'Generate Estimate'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Future work: Chat section - currently hidden */}
            <div className="hidden">
              <h3 className="text-xl font-semibold mb-2 text-gray-200">Project Chat</h3>
              <div className="border border-gray-700 rounded-lg p-4 h-64 overflow-y-auto mb-4 bg-gray-800">
                {chatMessages.map((message, index) => (
                  <p key={index} className="mb-2 text-gray-300">
                    {message}
                  </p>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message here..."
                  className="flex-grow bg-gray-700 text-white border-gray-600"
                />
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  Send
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* File Upload Dialog */}
      <DialogPrimitive.Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogPrimitive.DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogPrimitive.DialogHeader>
            <DialogPrimitive.DialogTitle>Add File Description</DialogPrimitive.DialogTitle>
          </DialogPrimitive.DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <Label htmlFor="file-name" className="text-gray-300 mb-2 block">Selected File</Label>
              <div className="flex items-center bg-gray-700 p-2 rounded">
                <FileText className="mr-2 h-4 w-4 text-blue-400" />
                <span>{fileToUpload?.name}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                File size: {fileToUpload ? (fileToUpload.size / (1024 * 1024)).toFixed(2) : 0} MB
                {fileToUpload && fileToUpload.size / (1024 * 1024) > 8 && (
                  <span className="text-red-400 ml-2">
                    (Exceeds 8MB limit)
                  </span>
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="file-description" className="text-gray-300 mb-2 block">
                Description <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="file-description"
                value={fileDescription}
                onChange={(e) => setFileDescription(e.target.value)}
                placeholder="Describe this file (required)"
                className="bg-gray-700 text-white border-gray-600"
                rows={3}
              />
              <p className="text-xs text-gray-400 mt-1">
                Provide a detailed description of the file to help the AI understand its content.
              </p>
            </div>
          </div>
          <DialogPrimitive.DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setUploadDialogOpen(false);
                setFileToUpload(null);
                setFileDescription("");
              }}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleFileUpload} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={
                isUploading || 
                !fileDescription.trim() || 
                (fileToUpload ? fileToUpload.size / (1024 * 1024) > 8 : false)
              }
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogPrimitive.DialogFooter>
        </DialogPrimitive.DialogContent>
      </DialogPrimitive.Dialog>

      {/* Note Dialog */}
      <DialogPrimitive.Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogPrimitive.DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogPrimitive.DialogHeader>
            <DialogPrimitive.DialogTitle>Add Project Note</DialogPrimitive.DialogTitle>
          </DialogPrimitive.DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <Label htmlFor="note-title" className="text-gray-300 mb-2 block">
                Note Title <span className="text-red-400">*</span>
              </Label>
              <Input
                id="note-title"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Enter a title for your note"
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>
            <div>
              <Label htmlFor="note-content" className="text-gray-300 mb-2 block">
                Note Content <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="note-content"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note here..."
                className="bg-gray-700 text-white border-gray-600"
                rows={6}
              />
              <p className="text-xs text-gray-400 mt-1">
                You can use Markdown formatting in your notes.
              </p>
            </div>
          </div>
          <DialogPrimitive.DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setNoteDialogOpen(false);
                setNoteTitle("");
                setNoteContent("");
              }}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddNote} 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isAddingNote || !noteTitle.trim() || !noteContent.trim()}
            >
              {isAddingNote ? 'Adding Note...' : 'Add Note'}
            </Button>
          </DialogPrimitive.DialogFooter>
        </DialogPrimitive.DialogContent>
      </DialogPrimitive.Dialog>

      {/* File Preview Dialog */}
      <DialogPrimitive.Dialog open={filePreviewDialogOpen} onOpenChange={setFilePreviewDialogOpen}>
        <DialogPrimitive.DialogContent className="bg-gray-800 text-white border-gray-700 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogPrimitive.DialogHeader>
            <DialogPrimitive.DialogTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5 text-blue-400" />
              {previewFile?.file_name}
            </DialogPrimitive.DialogTitle>
          </DialogPrimitive.DialogHeader>
          <div className="py-4 flex-grow overflow-auto">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin mr-2">⟳</div>
                <span>Loading file content...</span>
              </div>
            ) : (
              <>
                {previewFile && isImageFile(previewFile.file_name) ? (
                  <div className="flex justify-center">
                    {previewFile.file_url ? (
                      <img 
                        src={signedImageUrl} 
                        alt={previewFile.file_name} 
                        className="max-h-[60vh] object-contain"
                      />
                    ) : (
                      <div className="text-center text-gray-400">
                        Image path not available. This file may need to be re-uploaded.
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
                      Failed to load file content
                    </div>
                  )
                ) : (
                  <div className="text-center text-gray-400">
                    This file type cannot be previewed directly.
                  </div>
                )}
              </>
            )}
          </div>
          <DialogPrimitive.DialogFooter className="flex justify-between items-center">
            <div>
              {previewFile && previewFile.file_url && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (previewFile && previewFile.file_url) {
                      try {
                        // Create a signed URL with download option enabled
                        const { data, error } = await supabase.storage
                          .from(STORAGE_BUCKET_NAME)
                          .createSignedUrl(previewFile.file_url, 60, {
                            download: true,
                          });
                          
                        if (error) {
                          console.error('Error creating download URL:', error);
                          toast.error('Failed to generate download link');
                          return;
                        }
                        
                        // Open the signed URL in a new tab or trigger download
                        window.open(data.signedUrl, '_blank');
                        toast.success('File download initiated');
                      } catch (error) {
                        console.error('Error downloading file:', error);
                        toast.error('Failed to download file');
                      }
                    }
                  }}
                  className="inline-flex items-center text-blue-400 hover:text-blue-300 mr-4"
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
          </DialogPrimitive.DialogFooter>
        </DialogPrimitive.DialogContent>
      </DialogPrimitive.Dialog>
    </div>
  )
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

