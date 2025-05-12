'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { b } from '@/baml_client/baml_client'
import {
  AllowedTypes,
  type UserInput as BamlUserInput,
  type AssisantMessage as BamlAssistantMessage,
  type UpdateEstimateRequest as BamlUpdateEstimateRequest,
  type UpdateEstimateResponse as BamlUpdateEstimateResponse,
  type Event as BamlEvent,
  type BamlChatThread,
  type ConstructionProjectData,
  type EstimateLineItem,
  type InputFile
} from '@/baml_client/baml_client/types'

if (!process.env.SUPABASE_STORAGE_BUCKET) {
  throw new Error('Missing SUPABASE_STORAGE_BUCKET environment variable')
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY

// Add UploadedFile interface, mirroring the one in page.tsx for clarity
interface UploadedFile {
  id: string;
  file_name: string;
  description?: string;
  content?: string; // This might not be used directly here after changes
  type?: string; // This might not be used directly here after changes
  file_url: string;
  uploaded_at: string;
}

// ADDED: Define a richer event type for UI display and DB interactions (II.A)
export interface DisplayableBamlEvent {
  id: string; // Database ID for the event, useful for React keys
  type: AllowedTypes;
  data: BamlUserInput | BamlAssistantMessage | BamlUpdateEstimateRequest | BamlUpdateEstimateResponse;
  createdAt: string; // ISO string timestamp from the database
}

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
  path?: string; // This will hold the file_url from UploadedFile
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

// ADDED: New Server Action: getOrCreateChatThread (II.B)
export async function getOrCreateChatThread(projectId: string): Promise<{ threadId: string; events: DisplayableBamlEvent[]; name: string }> {
  const supabase = await createClient();
  let { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id, name')
    .eq('project_id', projectId)
    .single();

  if (threadError && threadError.code !== 'PGRST116') { // PGRST116: No rows found
    console.error('Error fetching chat thread:', threadError);
    throw new Error('Failed to fetch chat thread.');
  }

  if (!thread) {
    const now = new Date();
    const defaultName = `Chat - ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const { data: newThread, error: newThreadError } = await supabase
      .from('chat_threads')
      .insert({ project_id: projectId, name: defaultName })
      .select('id, name')
      .single();
    if (newThreadError || !newThread) {
      console.error('Error creating chat thread:', newThreadError);
      throw new Error('Failed to create chat thread.');
    }
    thread = newThread;
    return { threadId: thread.id, events: [], name: thread.name };
  }

  // Fetch existing events for the thread
  const { data: dbEvents, error: eventsError } = await supabase
    .from('chat_events')
    .select('id, event_type, data, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });

  if (eventsError) {
    console.error('Error fetching chat events:', eventsError);
    throw new Error('Failed to fetch chat events.');
  }

  const displayableEvents: DisplayableBamlEvent[] = (dbEvents || []).map(e => ({
    id: e.id,
    type: e.event_type as AllowedTypes,
    data: e.data as any,
    createdAt: e.created_at,
  }));

  return { threadId: thread.id, events: displayableEvents, name: thread.name };
}

// ADDED: New Server Action: postChatMessage (II.C)
interface PostChatMessageResult {
  userInputDisplayEvent: DisplayableBamlEvent; // The user's message as saved
  assistantResponseDisplayEvent?: DisplayableBamlEvent; // BAML's response as saved
  updateTriggered: boolean;
  error?: string;
}

export async function postChatMessage(
  threadId: string,
  projectId: string, // Required for startEstimateGeneration if triggered
  userInput: BamlUserInput // From baml_client/types
): Promise<PostChatMessageResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // 1. Save UserInput event
  const userInputToSave = {
    thread_id: threadId,
    event_type: 'UserInput',
    data: userInput,
    created_at: now,
  };
  const { data: savedUserInput, error: userInputSaveError } = await supabase
    .from('chat_events')
    .insert(userInputToSave)
    .select('id, created_at') // Get id and actual created_at from DB
    .single();

  if (userInputSaveError || !savedUserInput) {
    console.error('Error saving user input event:', userInputSaveError);
    return {
      userInputDisplayEvent: { id: 'temp-error', type: "UserInput" as AllowedTypes, data: userInput, createdAt: now },
      updateTriggered: false,
      error: 'Failed to save user message.'
    };
  }

  const userInputDisplayEvent: DisplayableBamlEvent = {
    id: savedUserInput.id,
    type: "UserInput" as AllowedTypes,
    data: userInput,
    createdAt: savedUserInput.created_at
  };

  // 2. Fetch all events for the current threadId to construct BamlChatThread input
  const { data: dbEvents, error: eventsFetchError } = await supabase
    .from('chat_events')
    .select('event_type, data') // Select only fields needed for BamlEvent
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (eventsFetchError) {
    console.error('Error fetching events for BAML:', eventsFetchError);
    return { userInputDisplayEvent, updateTriggered: false, error: 'Failed to fetch conversation history.' };
  }

  const bamlEventsForProcessing: BamlEvent[] = (dbEvents || []).map(dbEvent => ({
    type: dbEvent.event_type as AllowedTypes,
    data: dbEvent.data as any,
  }));

  const currentThreadState: BamlChatThread = { events: bamlEventsForProcessing };

  // 3. Call b.DetermineNextStep
  let nextBamlEventOutput: BamlEvent;
  try {
    // Ensure 'b' is accessible here; it should be if imported correctly at the top level
    nextBamlEventOutput = await b.DetermineNextStep(currentThreadState);
  } catch (bamlError) {
    console.error('BAML DetermineNextStep error:', bamlError);
    return { userInputDisplayEvent, updateTriggered: false, error: 'AI failed to determine next step.' };
  }

  // 4. Save the event returned by BAML
  const bamlEventToSave = {
    thread_id: threadId,
    event_type: nextBamlEventOutput.type,
    data: nextBamlEventOutput.data,
  };
  const { data: savedBamlEvent, error: bamlEventSaveError } = await supabase
    .from('chat_events')
    .insert(bamlEventToSave)
    .select('id, created_at')
    .single();

  if (bamlEventSaveError || !savedBamlEvent) {
    console.error('Error saving BAML event:', bamlEventSaveError);
     return {
      userInputDisplayEvent,
      assistantResponseDisplayEvent: { id: 'temp-baml-error', type: nextBamlEventOutput.type, data: nextBamlEventOutput.data, createdAt: new Date().toISOString() },
      updateTriggered: false,
      error: 'AI response generated but failed to save.'
    };
  }

  const assistantResponseDisplayEvent: DisplayableBamlEvent = {
    id: savedBamlEvent.id,
    type: nextBamlEventOutput.type,
    data: nextBamlEventOutput.data,
    createdAt: savedBamlEvent.created_at
  };

  let updateTriggered = false;
  // 5. If UpdateEstimateRequest, trigger estimate generation
  if (nextBamlEventOutput.type === "UpdateEstimateRequest") {
    const requestData = nextBamlEventOutput.data as BamlUpdateEstimateRequest;
    // Assuming startEstimateGeneration is defined elsewhere in this file and modified as per plan
    const estimateResult = await startEstimateGeneration(projectId, requestData.changes_to_make, threadId);
    if (estimateResult.error) {
      console.error('Error starting estimate generation from chat:', estimateResult.error);
      // An UpdateEstimateResponse (failure) event will be added by the modified checkEstimateStatus/processCompletedRun logic.
    } else {
      updateTriggered = true;
    }
  }

  return {
    userInputDisplayEvent,
    assistantResponseDisplayEvent,
    updateTriggered,
  };
}

// New Server Action: Get all chat threads for a project or general chats
export async function getChatThreads(projectId?: string): Promise<{ id: string; name: string; lastMessageAt: string }[]> {
  const supabase = await createClient();

  let query = supabase
    .from('chat_threads')
    .select('id, name, created_at');

  if (projectId) {
    // Get threads for a specific project
    query = query.eq('project_id', projectId);
  } else {
    // Get general threads (not associated with a project)
    query = query.eq('project_id', 'general');
  }

  // Order by latest activity
  query = query.order('created_at', { ascending: false });

  const { data: threads, error } = await query;

  if (error) {
    console.error('Error fetching chat threads:', error);
    return [];
  }

  // Get the last message timestamp for each thread
  const threadsWithLastMessage = await Promise.all((threads || []).map(async (thread) => {
    const { data: lastMessages } = await supabase
      .from('chat_events')
      .select('created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastMessageAt = lastMessages && lastMessages.length > 0
      ? lastMessages[0].created_at
      : thread.created_at;

    return {
      id: thread.id,
      name: thread.name,
      lastMessageAt
    };
  }));

  // Sort threads by latest message time
  return threadsWithLastMessage.sort((a, b) =>
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

// ADDED: Server Action: getChatEvents (for polling updates) (II.F)
export async function getChatEvents(threadId: string, sinceIsoTimestamp?: string): Promise<DisplayableBamlEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from('chat_events')
    .select('id, event_type, data, created_at')
    .eq('thread_id', threadId);

  if (sinceIsoTimestamp) {
    query = query.gt('created_at', sinceIsoTimestamp);
  }
  query = query.order('created_at', { ascending: true });

  const { data: dbEvents, error } = await query;

  if (error) {
    console.error('Error fetching chat events:', error);
    throw new Error('Failed to fetch chat events.');
  }

  return (dbEvents || []).map(e => ({
    id: e.id,
    type: e.event_type as AllowedTypes,
    data: e.data as any,
    createdAt: e.created_at,
  }));
}

/**
 * Start asynchronous estimate generation for a project
 */
// MODIFIED: startEstimateGeneration (II.D)
export async function startEstimateGeneration(
  projectId: string,
  requested_changes?: string,
  originatingChatThreadId?: string // New parameter
) {
  try {
    const supabase = await createClient()

    // Fetch uploaded files from the database
    const { data: uploadedFiles, error: filesError } = await supabase
      .from('files')
      .select('*') // Select all columns, assuming they match UploadedFile structure
      .eq('project_id', projectId);

    if (filesError) {
      console.error('Error fetching files for project:', filesError);
      return { error: `Failed to fetch files: ${filesError.message}` };
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return { error: 'No files found for this project to process.' };
    }
    
    // Get project info from database
    // const supabase = await createClient() // Supabase client already initialized
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError) {
      console.error('Error fetching project:', projectError)
      return { error: 'Failed to fetch project information' }
    }

    // Map UploadedFile to FileToProcess
    const filesToProcess: FileToProcess[] = uploadedFiles.map((file) => {
      // For text files
      if (file.file_name.endsWith('.txt') || file.file_name.endsWith('.md')) {
        return {
          type: 'text',
          name: file.file_name,
          description: file.description || '',
          path: file.file_url // Use file_url here
        };
      }
      // For images
      else if (file.file_name.match(/\.(jpeg|jpg|png|gif)$/i)) {
        return {
          type: 'image',
          name: file.file_name,
          description: file.description || '',
          path: file.file_url // Use file_url here
        };
      }
      // For other file types
      return {
        type: 'other',
        name: file.file_name,
        description: file.description || ''
        // No path needed for 'other' as per original logic, content won't be fetched
      };
    });

    // Check if any files are missing paths (for types that require it)
    const missingPaths = filesToProcess.filter(file =>
      (file.type === 'image' || file.type === 'text') && !file.path
    );

    if (missingPaths.length > 0) {
      const missingFileNames = missingPaths.map(f => f.name).join(', ');
      // It's better to return an error that the frontend can display meaningfully
      return {
        error: `Missing file paths for: ${missingFileNames}. These files may need to be re-uploaded.`,
        failedFiles: missingPaths // Optionally return the files that failed
      };
    }

    // Process files to load their content
    const processedFiles = await processFilesForInput(filesToProcess) // Pass the newly mapped files

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
      files: processedFiles,
      existing_estimate: project.ai_estimate ? JSON.parse(project.ai_estimate) : null,
      requested_changes: requested_changes
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
    // MODIFIED: task_job insertion to include originatingChatThreadId
    const taskJobInsertData: {
        project_id: string;
        thread_id: string; // LangGraph thread_id
        run_id: string;
        status: string;
        job_type: string;
        originating_chat_thread_id?: string; // Optional
    } = {
        project_id: projectId,
        thread_id: threadId, // This is LangGraph thread_id from context
        run_id: runId, // This is LangGraph run_id from context
        status: 'processing',
        job_type: 'estimate_generation',
    };

    if (originatingChatThreadId) {
        taskJobInsertData.originating_chat_thread_id = originatingChatThreadId;
    }

    const { error: jobError } = await supabase
      .from('task_jobs')
      .insert(taskJobInsertData);

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

// ADDED: Helper function for recording chat estimate update response (II.E)
async function recordChatEstimateUpdateResponse(
  originatingChatThreadId: string,
  success: boolean,
  errorMessage?: string // Optional error message
) {
  const supabase = await createClient();
  const responseData: BamlUpdateEstimateResponse = {
    success,
    error_message: success ? '' : (errorMessage || 'Estimate update failed due to an unknown reason.'),
  };

  const { error } = await supabase.from('chat_events').insert({
    thread_id: originatingChatThreadId,
    event_type: 'UpdateEstimateResponse',
    data: responseData,
  });

  if (error) {
    console.error('Error recording UpdateEstimateResponse to chat:', error);
  }
}

/**
 * Process a completed run, extract results, and update the database
 */
// REPLACED: processCompletedRun (II.E)
async function processCompletedRun(threadId: string, runId: string, projectId: string, taskJobId: string) {
  let success = false;
  let detailedErrorMessage: string | undefined;
  try {
    const supabase = await createClient(); // Ensure client is available

    // Join the run to get the results
    const joinResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${threadId}/runs/${runId}/join`, {
      headers: {
        'x-api-key': LANGGRAPH_API_KEY!,
      }
    });

    if (joinResponse.ok) {
        const result = await joinResponse.json();
        const aiEstimate = extractAIEstimate(result); // Assumes extractAIEstimate is defined
        if (aiEstimate) {
            // Assumes updateProjectEstimate is defined
            const updateResult = await updateProjectEstimate(projectId, aiEstimate);
            if (updateResult.error) {
                detailedErrorMessage = `Failed to update project estimate: ${updateResult.error}`;
                // success remains false
            } else {
                success = true;
            }
        } else {
            detailedErrorMessage = "AI estimate not found in LangGraph response.";
            // success remains false
        }
    } else {
        const errorText = await joinResponse.text();
        detailedErrorMessage = `Failed to join run: ${joinResponse.status}: ${errorText}`;
        // success remains false
    }

    if (success) {
        await updateTaskStatus(taskJobId, 'completed'); // Assumes updateTaskStatus is defined
    } else {
        await updateTaskStatus(taskJobId, 'failed', detailedErrorMessage || 'Processing completed but resulted in an error.');
    }

  } catch (error) {
    console.error('Error processing completed run:', error);
    detailedErrorMessage = error instanceof Error ? error.message : 'Unknown error during run processing.';
    await updateTaskStatus(taskJobId, 'failed', detailedErrorMessage);
    // success remains false
  }

  // After processing, check if it originated from chat
  const supabase = await createClient(); // Re-initialize or ensure it's available
  const { data: taskJob, error: jobFetchError } = await supabase
    .from('task_jobs')
    .select('originating_chat_thread_id')
    .eq('id', taskJobId)
    .single();

  if (jobFetchError) {
    console.error("Failed to fetch task job for chat update:", jobFetchError);
  } else if (taskJob?.originating_chat_thread_id) {
    await recordChatEstimateUpdateResponse(taskJob.originating_chat_thread_id, success, detailedErrorMessage);
  }
}

/**
 * Check the status of an estimate generation job
 */
// REPLACED: checkEstimateStatus (II.E)
export async function checkEstimateStatus(projectId: string) {
  const supabase = await createClient();
  try {
    const { data: taskJob, error: taskJobError } = await supabase
      .from('task_jobs')
      .select('*') // Select all columns as per existing logic
      .eq('project_id', projectId)
      .eq('job_type', 'estimate_generation')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (taskJobError) {
      if (taskJobError.code === 'PGRST116') { // No rows found
        return { status: 'not_started' as TaskJobStatus };
      }
      console.error('Error fetching task job:', taskJobError);
      return { error: 'Failed to fetch task status' };
    }

    if (taskJob.status === 'completed' || taskJob.status === 'failed') {
      return {
        status: taskJob.status as TaskJobStatus,
        error: taskJob.error_message // This is the error_message from task_jobs table
      };
    }

    // If the task is still processing, check the actual status from the API
    // Using existing fetch URL structure
    const response = await fetch(`${LANGGRAPH_API_URL}/threads/${taskJob.thread_id}/runs/${taskJob.run_id}`, {
      headers: {
        'x-api-key': LANGGRAPH_API_KEY!,
      }
    });

     if (!response.ok) {
      const apiErrorMsgBase = `LangGraph API request failed: ${response.status}`;
      const errorText = await response.text();
      const apiErrorMsg = `${apiErrorMsgBase} - ${errorText}`;
      
      // It's important to mark the job as failed in our DB if the API call fails definitively
      // The plan specifically handles 404, but other errors should also be considered terminal for the run.
      // For simplicity, treating non-OK responses (that are not transient) as failures.
      await updateTaskStatus(taskJob.id, 'failed', apiErrorMsg);
      if (taskJob.originating_chat_thread_id) {
        await recordChatEstimateUpdateResponse(taskJob.originating_chat_thread_id, false, apiErrorMsg);
      }
      // The original code returned { error: `API request failed: ${response.status}` } for non-404 errors
      // Returning status 'failed' is more consistent with the overall flow.
      return { status: 'failed' as TaskJobStatus, error: apiErrorMsg };
    }

    const runStatus = await response.json() as { status: string }; // Assuming this is the shape

    switch (runStatus.status) {
      case 'success':
        // processCompletedRun will handle updating task status and chat.
        await processCompletedRun(taskJob.thread_id, taskJob.run_id, projectId, taskJob.id);
        return { status: 'completed' as TaskJobStatus };
      
      case 'error':
      case 'timeout':
      case 'interrupted':
        const failureMessage = `Run failed with status: ${runStatus.status}`;
        await updateTaskStatus(taskJob.id, 'failed', failureMessage);
        if (taskJob.originating_chat_thread_id) {
          await recordChatEstimateUpdateResponse(taskJob.originating_chat_thread_id, false, failureMessage);
        }
        return { status: 'failed' as TaskJobStatus, error: failureMessage };
      
      case 'pending': // Explicitly handle pending
      default: // Includes other states like 'processing' if any
        return { status: 'processing' as TaskJobStatus }; // Or map to your TaskJobStatus appropriately
    }
  } catch (error) {
    console.error('Error checking estimate status:', error);
    // Attempt to update task status to failed if an unexpected error occurs, and if we have a taskJob.id
    // This part is tricky as taskJob might not be defined if error happens before its fetch.
    // For now, sticking to the plan's simpler error return.
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
  // project_info?: string; // Assuming this might be part of the API response structure
  ai_estimate?: ConstructionProjectData;
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

