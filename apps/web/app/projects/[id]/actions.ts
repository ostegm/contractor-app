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

// RENAMED and MODIFIED: Only fetches existing thread, doesn't create
export async function getChatThreadDetails(threadId: string): Promise<{ events: DisplayableBamlEvent[]; name: string } | null> {
  const supabase = await createClient();
  // Fetch the specific thread by ID
  let { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id, name')
    .eq('id', threadId)
    .single();

  if (threadError || !thread) {
    // If not found (PGRST116) or other error, return null
    if (threadError && threadError.code !== 'PGRST116') {
      console.error(`Error fetching chat thread ${threadId}:`, threadError);
    }
    return null; // Indicate thread not found or error
  }

  // Fetch existing events for the thread
  const { data: dbEvents, error: eventsError } = await supabase
    .from('chat_events')
    .select('id, event_type, data, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });

  if (eventsError) {
    console.error('Error fetching chat events:', eventsError);
    // Depending on requirements, might throw or return null/partial data
    return null; // Indicate error fetching events
  }

  const displayableEvents: DisplayableBamlEvent[] = (dbEvents || []).map(e => ({
    id: e.id,
    type: e.event_type as AllowedTypes,
    data: e.data as any, // TODO: Consider more type safety if possible
    createdAt: e.created_at,
  }));

  return { events: displayableEvents, name: thread.name };
}

interface PostChatMessageResult {
  userInputDisplayEvent: DisplayableBamlEvent; // The user's message as saved
  assistantResponseDisplayEvent?: DisplayableBamlEvent; // BAML's response as saved
  updateTriggered: boolean;
  error?: string;
}

// NEW Server Action: Creates thread and posts the first message
interface CreateChatResult extends PostChatMessageResult {
  newThreadId: string;
}

// --- Internal Helper Function for Handling BAML Response --- 
async function _handleBamlResponse(
  threadId: string,
  projectId: string,
  bamlEventOutput: BamlEvent
): Promise<{ assistantResponseDisplayEvent: DisplayableBamlEvent; updateTriggered: boolean; error?: string }> {
  const supabase = await createClient();
  let assistantResponseDisplayEvent: DisplayableBamlEvent;
  let updateTriggered = false;
  let errorMsg: string | undefined;

  // 1. Save the event returned by BAML
  const bamlEventToSave = { thread_id: threadId, event_type: bamlEventOutput.type, data: bamlEventOutput.data };
  const { data: savedBamlEventData, error: bamlEventSaveError } = await supabase
    .from('chat_events')
    .insert(bamlEventToSave)
    .select('id, created_at')
    .single();

  if (bamlEventSaveError || !savedBamlEventData) {
    console.error('Error saving BAML event (_handleBamlResponse):', bamlEventSaveError);
    errorMsg = 'AI response generated but failed to save.';
    // Create temporary display event even if save failed
    assistantResponseDisplayEvent = { id: `temp-baml-error-${Date.now()}`, type: bamlEventOutput.type, data: bamlEventOutput.data, createdAt: new Date().toISOString() };
  } else {
    assistantResponseDisplayEvent = {
      id: savedBamlEventData.id,
      type: bamlEventOutput.type,
      data: bamlEventOutput.data,
      createdAt: savedBamlEventData.created_at
    };
  }

  // 2. Handle UpdateEstimateRequest if needed
  if (bamlEventOutput.type === "UpdateEstimateRequest") {
    const requestData = bamlEventOutput.data as BamlUpdateEstimateRequest;
    // Assuming startEstimateGeneration exists and works correctly
    const estimateResult = await startEstimateGeneration(projectId, requestData.changes_to_make, threadId);
    if (estimateResult.error) {
      console.error('Error starting estimate generation from chat (_handleBamlResponse):', estimateResult.error);
       // Potentially append estimate error to errorMsg? Needs careful handling depending on desired UX
       // For now, the error is logged, and the main error message (if any) from saving will be returned.
    } else {
      updateTriggered = true;
    }
  }

  return { assistantResponseDisplayEvent, updateTriggered, error: errorMsg };
}
// --- End Internal Helper Function --- 

export async function createChatThreadAndPostMessage(
  projectId: string,
  userInput: BamlUserInput
): Promise<CreateChatResult> {
  const supabase = await createClient();
  const now = new Date();
  let newThreadId = '';
  let userInputDisplayEvent: DisplayableBamlEvent | null = null;

  try {
    // 1. Create the new chat thread
    // Use first few words of user message for the name, or a timestamp default
    const firstWords = userInput.message.split(' ').slice(0, 5).join(' ');
    let defaultName = firstWords || `Chat - ${now.toISOString().split('T')[0]}`;
    if (defaultName.length > 50) { // Keep name reasonably short
        defaultName = defaultName.substring(0, 47) + '...';
    }

    const { data: newThread, error: newThreadError } = await supabase
      .from('chat_threads')
      .insert({ project_id: projectId, name: defaultName })
      .select('id') // Only need the ID
      .single();

    if (newThreadError || !newThread) {
      console.error('Error creating chat thread:', newThreadError);
      throw new Error('Failed to create chat thread.');
    }
    newThreadId = newThread.id;

    // 2. Save the first UserInput event
    const userInputToSave = {
      thread_id: newThreadId,
      event_type: 'UserInput' as const, // Use const for specific type
      data: userInput,
      created_at: now.toISOString(), // Use ISO string consistent with polling
    };
    const { data: savedUserInput, error: userInputSaveError } = await supabase
      .from('chat_events')
      .insert(userInputToSave)
      .select('id, created_at')
      .single();

    if (userInputSaveError || !savedUserInput) {
      console.error('Error saving initial user input event:', userInputSaveError);
      // Attempt cleanup: Delete the created thread if the first message fails to save
      await supabase.from('chat_threads').delete().eq('id', newThreadId);
      throw new Error('Failed to save initial user message.');
    }

    userInputDisplayEvent = {
      id: savedUserInput.id,
      type: "UserInput" as AllowedTypes, // CAST to AllowedTypes
      data: userInput,
      createdAt: savedUserInput.created_at
    };

    // 3. Call b.DetermineNextStep with only the first user message
    const firstThreadState: BamlChatThread = { events: [{ type: 'UserInput' as AllowedTypes, data: userInput }] };
    const nextBamlEventOutput = await b.DetermineNextStep(firstThreadState);

    // 4. Handle BAML response using helper function
    const { assistantResponseDisplayEvent, updateTriggered, error: bamlHandleError } = await _handleBamlResponse(
      newThreadId,
      projectId,
      nextBamlEventOutput
    );

    // If the helper encountered an error saving the BAML event, return partial success
    if (bamlHandleError) {
        return {
            newThreadId,
            userInputDisplayEvent, // User input was saved
            assistantResponseDisplayEvent, // Contains temp event data
            updateTriggered: false, // updateTriggered from helper might be true, but saving failed, so set false?
            error: bamlHandleError
        };
    }

    // 5. Revalidate path
    revalidatePath(`/projects/${projectId}`);

    // Return success state
    return {
      newThreadId,
      userInputDisplayEvent,
      assistantResponseDisplayEvent, // Contains saved event data
      updateTriggered,
    };

  } catch (error) {
    console.error('Error in createChatThreadAndPostMessage:', error);
    // Attempt to cleanup thread if created but subsequent steps failed
     if (newThreadId) {
       try {
            await supabase.from('chat_threads').delete().eq('id', newThreadId);
            console.log(`Cleaned up partially created thread ${newThreadId}`);
       } catch (cleanupError) {
            console.error(`Failed to cleanup thread ${newThreadId}:`, cleanupError);
       }
     }
    // Return error state - ensure shape matches CreateChatResult but indicates failure
    // Provide a default object if userInputDisplayEvent is null
    const finalUserInputDisplayEvent = userInputDisplayEvent ?? { 
      id: 'temp-error-user-catch', 
      type: "UserInput" as AllowedTypes, // CAST to AllowedTypes
      data: userInput, 
      createdAt: now.toISOString() 
    };

    return {
      newThreadId: '', // No valid thread ID created
      userInputDisplayEvent: finalUserInputDisplayEvent, // Use the non-null version
      updateTriggered: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred while creating the chat.',
    };
  }
}

export async function postChatMessage(
  threadId: string,
  projectId: string,
  userInput: BamlUserInput
): Promise<PostChatMessageResult> {
    const supabase = await createClient();
    const now = new Date().toISOString();
    let userInputDisplayEvent: DisplayableBamlEvent;

    // 1. Save UserInput event
    const userInputToSave = {
      thread_id: threadId,
      event_type: 'UserInput' as const,
      data: userInput,
      created_at: now,
    };
    const { data: savedUserInput, error: userInputSaveError } = await supabase
      .from('chat_events')
      .insert(userInputToSave)
      .select('id, created_at')
      .single();

    if (userInputSaveError || !savedUserInput) {
      console.error('Error saving user input event:', userInputSaveError);
      return {
        // Provide a temporary representation of the user input even if save failed
        userInputDisplayEvent: { id: `temp-error-${Date.now()}`, type: "UserInput" as AllowedTypes, data: userInput, createdAt: now }, // CAST to AllowedTypes
        updateTriggered: false,
        error: 'Failed to save user message.'
      };
    }

    userInputDisplayEvent = {
      id: savedUserInput.id,
      type: "UserInput" as AllowedTypes, // CAST to AllowedTypes
      data: userInput,
      createdAt: savedUserInput.created_at
    };

    // 2. Fetch history
    const { data: dbEvents, error: eventsFetchError } = await supabase
      .from('chat_events')
      .select('event_type, data') // Select only fields needed for BamlEvent
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (eventsFetchError) {
      console.error('Error fetching events for BAML:', eventsFetchError);
      // Return the saved user input, but indicate history fetch failed
      return { userInputDisplayEvent, updateTriggered: false, error: 'Failed to fetch conversation history.' };
    }

    const bamlEventsForProcessing: BamlEvent[] = (dbEvents || []).map(dbEvent => ({
      type: dbEvent.event_type as AllowedTypes,
      data: dbEvent.data as any,
    }));

    const currentThreadState: BamlChatThread = { events: bamlEventsForProcessing };

    // 3. Call BAML
    let nextBamlEventOutput: BamlEvent;
    try {
        nextBamlEventOutput = await b.DetermineNextStep(currentThreadState);
    } catch (bamlError) {
        console.error('BAML DetermineNextStep error:', bamlError);
        return { userInputDisplayEvent, updateTriggered: false, error: 'AI failed to determine next step.' };
    }

    // 4. Handle BAML response using helper function
    const { assistantResponseDisplayEvent, updateTriggered, error: bamlHandleError } = await _handleBamlResponse(
      threadId,
      projectId,
      nextBamlEventOutput
    );

    // 5. Return result
    return {
      userInputDisplayEvent,
      assistantResponseDisplayEvent, // Contains saved or temp event data
      updateTriggered,
      error: bamlHandleError // Include error if BAML save failed
    };
}

export async function getChatThreads(projectId: string): Promise<{ id: string; name: string; lastMessageAt: string }[]> {
  const supabase = await createClient();
  let query = supabase
    .from('chat_threads')
    .select('id, name, created_at')
    .eq('project_id', projectId); // Only query for the specific project

  // Fetch the threads based on the constructed query
  const { data: threadsData, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching chat threads:', error);
    throw new Error(`Failed to fetch chat threads: ${error.message}`);
  }

  // Map data - assuming lastMessageAt needs to be derived or is actually created_at for sorting?
  // For now, using created_at as lastMessageAt based on the select query.
  return (threadsData || []).map(thread => ({
    id: thread.id,
    name: thread.name,
    lastMessageAt: thread.created_at // Using created_at based on select
  }));
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

// ADDED: Rename Chat Thread Server Action
export async function renameChatThread(threadId: string, newName: string): Promise<void> {
  console.log(`Server Action: Renaming thread ${threadId} to "${newName}"`);
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('chat_threads')
    .update({ name: newName })
    .eq('id', threadId);

  if (error) {
    console.error('Error renaming chat thread:', error);
    throw new Error(`Failed to rename chat thread: ${error.message}`);
  }

  // Find the project ID associated with the thread to revalidate the correct path
  const { data: threadData, error: fetchError } = await supabase
    .from('chat_threads')
    .select('project_id')
    .eq('id', threadId)
    .single();

  if (fetchError) {
    console.error('Error fetching project_id for revalidation:', fetchError);
    // Proceed without revalidation if fetching project_id fails, but log it.
  } else if (threadData?.project_id) {
    revalidatePath(`/projects/${threadData.project_id}`);
    // Optionally revalidate the dashboard or other relevant paths if needed
  } else {
      console.warn('Could not find project_id for thread to revalidate path.');
  }

  // No need for simulated delay in actual implementation
}

// ADDED: Delete Chat Thread Server Action
export async function deleteChatThread(threadId: string): Promise<void> {
  console.log(`Server Action: Deleting thread ${threadId}`);
  const supabase = await createClient();

  // Find the project ID before deleting for revalidation
  const { data: threadData, error: fetchError } = await supabase
    .from('chat_threads')
    .select('project_id')
    .eq('id', threadId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'Not Found' error if already deleted
      console.error('Error fetching project_id before deleting thread:', fetchError);
      // Depending on requirements, might want to throw here or proceed cautiously
  }

  // Delete associated chat events first (optional but recommended for cleanup)
  const { error: eventsError } = await supabase
    .from('chat_events')
    .delete()
    .eq('thread_id', threadId);

  if (eventsError) {
    console.error('Error deleting chat events:', eventsError);
    // Decide if this is a fatal error for the deletion process
  }

  // Delete the chat thread
  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', threadId);

  if (error) {
    console.error('Error deleting chat thread:', error);
    throw new Error(`Failed to delete chat thread: ${error.message}`);
  }

  // Revalidate path if project_id was found
  if (threadData?.project_id) {
      revalidatePath(`/projects/${threadData.project_id}`);
  } else {
      console.warn('Could not revalidate path after deleting thread, project_id not found.');
  }

  // No need for simulated delay
}

