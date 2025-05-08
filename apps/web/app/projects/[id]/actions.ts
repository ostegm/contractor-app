'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ConstructionProjectData, EstimateLineItem, InputFile } from '@/baml_client/baml_client/types'

if (!process.env.SUPABASE_STORAGE_BUCKET) {
  throw new Error('Missing SUPABASE_STORAGE_BUCKET environment variable')
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY


function sanitizeFileName(fileName: string): string {
  // Replace spaces and special characters with underscores
  // Remove any characters that aren't alphanumeric, underscores, dots, or dashes
  const name = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Ensure the name is unique by adding a timestamp
  const timestamp = Date.now()
  const ext = name.split('.').pop()
  const baseName = name.split('.').slice(0, -1).join('.')
  return `${baseName}_${timestamp}.${ext}`
}



export async function uploadFile(formData: FormData, projectId: string) {
  const supabase = await createClient()
  
  try {
    const file = formData.get('file') as File
    const description = formData.get('description') as string

    if (!file) {
      return { error: 'No file provided' }
    }

    if (!description) {
      return { error: 'File description is required' }
    }

    // Check file size
    const fileSizeInMB = file.size / (1024 * 1024)
    if (fileSizeInMB > 8) {
      return { error: `File size exceeds 8MB limit (${fileSizeInMB.toFixed(2)}MB)` }
    }

    const sanitizedFileName = sanitizeFileName(file.name)
    const filePath = `${projectId}/${sanitizedFileName}`

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file)

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return { error: `Failed to upload file: ${uploadError.message}` }
    }



    console.log(`File path: ${filePath}`);

    // Try to insert with description and file path
    const { error: dbError } = await supabase
      .from('files')
      .insert({
        project_id: projectId,
        file_name: file.name,

        file_url: filePath,
        description: description,
      })

    // Check if the database insertion failed
    if (dbError) {
      console.error('Error inserting file record into database:', dbError)
      // Optional: Attempt to delete the orphaned file from storage?
      // await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return { error: `Failed to save file record to database: ${dbError.message}` }
    }
      
    return { success: true, filePath, bucket: STORAGE_BUCKET }
  } catch (error) {
    console.error('Unexpected error during file upload:', error)
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}

// Extended InputFile type to add fields needed for our web application
interface FileToProcess extends InputFile {
  error?: string;
  path?: string;
  bucket?: string;
}

// Define task job status types
type TaskJobStatus = 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';

// Re-export the BAML types for use in other files
export type EstimateItem = EstimateLineItem;
export type AIEstimate = ConstructionProjectData;

async function processFilesForInput(files: FileToProcess[]): Promise<FileToProcess[]> {
  // Process files to load their content
  const processedFiles: FileToProcess[] = await Promise.all(files.map(async (file) => {
    try {
      // For images and text files, use Supabase's signed URLs
      if ((file.type === 'image' || file.type === 'text') && file.path) {
        console.log(`Processing ${file.type} file: ${file.name} with path: ${file.path}`);
        
        // Create a signed URL for the file
        const bucket = file.bucket || STORAGE_BUCKET;
        const supabase = await createClient();
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(file.path, 3600); // 1 hour expiration
        
        if (signedUrlError) {
          console.error(`Error creating signed URL for file ${file.name}:`, signedUrlError);
          return {
            ...file,
            content: '',
            error: `Failed to create signed URL: ${signedUrlError.message}`
          };
        }
        
        // Fetch the content using the signed URL
        const response = await fetch(signedUrlData.signedUrl);
        if (!response.ok) {
          console.error(`Error fetching file ${file.name}: ${response.status} ${response.statusText}`);
          return {
            ...file,
            content: '',
            error: `Failed to fetch file: ${response.status} ${response.statusText}`
          };
        }
        
        if (file.type === 'image') {
          // Convert the response to base64 for images
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          
          return {
            ...file,
            content: base64
          };
        } else {
          // Convert the response to text for text files
          const content = await response.text();
          
          return {
            ...file,
            content
          };
        }
      }
      
      // For other file types, just pass through
      return file;
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
      return {
        ...file,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error processing file'
      };
    }
  }));

  return processedFiles;
}

export async function updateProjectEstimate(projectId: string, estimate: ConstructionProjectData) {
  try {
    const supabase = await createClient()
    
    // Convert the estimate to a JSON string
    const estimateJson = JSON.stringify(estimate)
    
    // Try to update with ai_estimate
    const { error } = await supabase
      .from('projects')
      .update({ ai_estimate: estimateJson })
      .eq('id', projectId)

    // If there's an error with the ai_estimate column, log it
    if (error && error.message.includes("Could not find the 'ai_estimate' column")) {
      console.warn('ai_estimate column not found in projects table. Please run the database migration.')
      return { 
        error: 'AI estimate could not be saved to the database. Database schema needs to be updated.',
        ai_estimate: estimate // Still return the generated estimate for display
      }
    } else if (error) {
      console.error('Error updating AI estimate:', error)
      return { error: 'Failed to update AI estimate' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating AI estimate:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function updateProjectInfo(projectId: string, projectInfo: string) {
  try {
    const supabase = await createClient()
    
    // Try to update with project_info first
    const { error } = await supabase
      .from('projects')
      .update({ project_info: projectInfo })
      .eq('id', projectId)

    // If there's an error with the project_info column, log it
    if (error && error.message.includes("Could not find the 'project_info' column")) {
      console.warn('Project_info column not found in projects table. Please run the database migration.')
      return { 
        error: 'Project information could not be saved to the database. Database schema needs to be updated.',
        updated_project_info: projectInfo // Still return the generated info for display
      }
    } else if (error) {
      console.error('Error updating project info:', error)
      return { error: 'Failed to update project information' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating project info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function clearProjectInfo(projectId: string) {
  try {
    const supabase = await createClient()
    
    // Update project_info to empty string
    const { error } = await supabase
      .from('projects')
      .update({ project_info: '' })
      .eq('id', projectId)

    if (error) {
      console.error('Error clearing project info:', error)
      return { error: 'Failed to clear project information' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error clearing project info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function clearProjectEstimate(projectId: string) {
  try {
    const supabase = await createClient()
    
    // Update ai_estimate to empty string
    const { error } = await supabase
      .from('projects')
      .update({ ai_estimate: null })
      .eq('id', projectId)

    if (error) {
      console.error('Error clearing project estimate:', error)
      return { error: 'Failed to clear project estimate' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error clearing project estimate:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

/**
 * Start asynchronous estimate generation for a project
 */
export async function startEstimateGeneration(projectId: string, files: FileToProcess[]) {
  try {
    // Get project info from database
    const supabase = await createClient()
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError) {
      console.error('Error fetching project:', projectError)
      return { error: 'Failed to fetch project information' }
    }

    // Process files to load their content
    const processedFiles = await processFilesForInput(files)

    // Check for failures in processed files
    const failedFiles = processedFiles.filter(file => 
      (file.type === 'image' && !file.content && file.error) || 
      (file.type === 'text' && !file.content && file.error)
    )

    if (failedFiles.length > 0) {
      const failedFileNames = failedFiles.map(f => f.name).join(', ')
      return { 
        error: `Failed to fetch content for ${failedFiles.length} file(s): ${failedFileNames}.`,
        failedFiles
      }
    }

    // Create a thread
    const createThreadResponse = await fetch(`${LANGGRAPH_API_URL}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGGRAPH_API_KEY!,
      },
      body: JSON.stringify({})
    })

    if (!createThreadResponse.ok) {
      const errorText = await createThreadResponse.text()
      throw new Error(`Thread creation failed: ${createThreadResponse.status}: ${errorText}`)
    }

    const threadResult = await createThreadResponse.json() as { thread_id: string }
    const threadId = threadResult.thread_id

    // Create the input state
    const inputState = {
      project_info: project.project_info || `# ${project.name}\n\n${project.description}`,
      files: processedFiles,
      updated_project_info: ''
    }

    // Create a background run
    const createRunResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGGRAPH_API_KEY!,
      },
      body: JSON.stringify({
        assistant_id: 'file_processor',
        input: inputState
      })
    })

    if (!createRunResponse.ok) {
      const errorText = await createRunResponse.text()
      throw new Error(`Run creation failed: ${createRunResponse.status}: ${errorText}`)
    }

    const createResult = await createRunResponse.json() as { run_id: string }
    const runId = createResult.run_id

    // Create a task_job entry in the database
    const { error: jobError } = await supabase
      .from('task_jobs')
      .insert({
        project_id: projectId,
        thread_id: threadId,
        run_id: runId,
        status: 'processing',
        job_type: 'estimate_generation'
      })

    if (jobError) {
      console.error('Error creating task job:', jobError)
      return { error: 'Failed to create task tracking' }
    }

    // Return success with job IDs
    return { 
      success: true, 
      message: 'Estimate generation started',
      thread_id: threadId,
      run_id: runId
    }
  } catch (error) {
    console.error('Error starting estimate generation:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

/**
 * Check the status of an estimate generation job
 */
export async function checkEstimateStatus(projectId: string) {
  try {
    const supabase = await createClient()
    
    // Get the most recent task job for this project
    const { data: taskJob, error: taskJobError } = await supabase
      .from('task_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('job_type', 'estimate_generation')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (taskJobError) {
      if (taskJobError.code === 'PGRST116') {
        // No task found
        return { status: 'not_started' as TaskJobStatus }
      }
      console.error('Error fetching task job:', taskJobError)
      return { error: 'Failed to fetch task status' }
    }

    // If the task is already completed or failed, just return the status
    if (taskJob.status === 'completed' || taskJob.status === 'failed') {
      return { 
        status: taskJob.status as TaskJobStatus,
        error: taskJob.error_message
      }
    }

    // If the task is still processing, check the actual status from the API
    const response = await fetch(`${LANGGRAPH_API_URL}/threads/${taskJob.thread_id}/runs/${taskJob.run_id}`, {
      headers: {
        'x-api-key': LANGGRAPH_API_KEY!,
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        // If the run is not found, it might have been deleted
        await updateTaskStatus(taskJob.id, 'failed', 'Run not found in LangGraph API')
        return { status: 'failed' as TaskJobStatus, error: 'Run not found in LangGraph API' }
      }
      
      const errorText = await response.text()
      console.error(`API request failed: ${response.status}: ${errorText}`)
      return { error: `API request failed: ${response.status}` }
    }

    const runStatus = await response.json() as { status: string }

    // Update the database based on the run status
    switch (runStatus.status) {
      case 'success':
        // Get the result and update the database
        await processCompletedRun(taskJob.thread_id, taskJob.run_id, projectId, taskJob.id)
        return { status: 'completed' as TaskJobStatus }
      
      case 'error':
      case 'timeout':
      case 'interrupted':
        await updateTaskStatus(taskJob.id, 'failed', `Run failed with status: ${runStatus.status}`)
        return { status: 'failed' as TaskJobStatus, error: `Run failed with status: ${runStatus.status}` }
      
      case 'pending':
      default:
        // Still in progress
        return { status: 'processing' as TaskJobStatus }
    }
  } catch (error) {
    console.error('Error checking estimate status:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

/**
 * Process a completed run, extract results, and update the database
 */
async function processCompletedRun(threadId: string, runId: string, projectId: string, taskJobId: string) {
  try {    
    // Join the run to get the results
    const joinResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${threadId}/runs/${runId}/join`, {
      headers: {
        'x-api-key': LANGGRAPH_API_KEY!,
      }
    })

    if (!joinResponse.ok) {
      const errorText = await joinResponse.text()
      await updateTaskStatus(taskJobId, 'failed', `Failed to join run: ${joinResponse.status}: ${errorText}`)
      throw new Error(`Failed to join run: ${joinResponse.status}: ${errorText}`)
    }

    const result = await joinResponse.json()
    
    // Extract updated project info and AI estimate from the response
    const updatedProjectInfo = extractProjectInfo(result)
    const aiEstimate = extractAIEstimate(result)

    // Update the project in the database
    if (updatedProjectInfo) {
      await updateProjectInfo(projectId, updatedProjectInfo)
    }

    if (aiEstimate) {
      await updateProjectEstimate(projectId, aiEstimate)
    }

    // Update the task status to completed
    await updateTaskStatus(taskJobId, 'completed')
    
    return { success: true }
  } catch (error) {
    console.error('Error processing completed run:', error)
    await updateTaskStatus(taskJobId, 'failed', error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

/**
 * Update the status of a task job
 */
interface TaskJobUpdate {
  status: string;
  error_message?: string;
}

async function updateTaskStatus(taskJobId: string, status: string, errorMessage?: string) {
  const supabase = await createClient()
  
  const updateData: TaskJobUpdate = { status }
  if (errorMessage) {
    updateData.error_message = errorMessage
  }
  
  const { error } = await supabase
    .from('task_jobs')
    .update(updateData)
    .eq('id', taskJobId)
  
  if (error) {
    console.error('Error updating task status:', error)
  }
}

/**
 * Helper to extract project info from API response
 */
interface ApiResponse {
  updated_project_info?: string;
  ai_estimate?: ConstructionProjectData;
}

function extractProjectInfo(result: ApiResponse): string | null {
  if (result.updated_project_info) {
    return result.updated_project_info
  }
  return null
}

/**
 * Helper to extract AI estimate from API response
 */
function extractAIEstimate(result: ApiResponse): ConstructionProjectData | null {
  if (result.ai_estimate) {
    return result.ai_estimate
  }
  return null
}

