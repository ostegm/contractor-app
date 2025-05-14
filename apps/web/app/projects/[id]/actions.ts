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
  type InputFile,
  type VideoAnalysis
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
    if (fileSizeInMB > 500) {
      return { error: `File size exceeds 500MB limit (${fileSizeInMB.toFixed(2)}MB)` }
    }

    // For video files, warn if they're large but still allowed
    if (file.type?.startsWith('video/') && fileSizeInMB > 100) {
      console.warn(`Large video file being uploaded: ${fileSizeInMB.toFixed(2)}MB. This may take some time to process.`)
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

    // Insert file metadata into the database
    const { data: newFileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        project_id: projectId,
        file_name: file.name, // Store original filename
        file_url: filePath,   // Store storage path
        description: description,
        type: file.type || 'application/octet-stream', // Store MIME type
      })
      .select('id, type') // Select id and type of the newly inserted record
      .single();

    if (dbError || !newFileRecord) {
      console.error('Error inserting file record into database:', dbError)
      // Optional: Attempt to delete the orphaned file from storage
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return { error: `Failed to save file record to database: ${dbError?.message}` }
    }
      
    // Check if the uploaded file is a video and start processing automatically
    let videoProcessingInfo: { jobId?: string; error?: string, isVideo?: boolean } = { isVideo: false };
    const isVideo = newFileRecord.type?.startsWith('video/');

    if (isVideo) {
      videoProcessingInfo.isVideo = true;
      console.log(`Video file detected (${newFileRecord.id}), starting automatic processing...`);
      const processingResult = await startVideoProcessing(projectId, newFileRecord.id);
      if (processingResult.error) {
        console.error(`Automatic video processing failed to start for file ${newFileRecord.id}:`, processingResult.error);
        // Return success for upload, but include a warning/error about processing start failure
        videoProcessingInfo.error = `File uploaded, but auto-processing failed: ${processingResult.error}`;
      } else if (processingResult.jobId) {
        videoProcessingInfo.jobId = processingResult.jobId;
        console.log(`Automatic video processing started. Job ID: ${processingResult.jobId}`);
      }
    }
    
    revalidatePath(`/projects/${projectId}`); // Revalidate after file upload and potential job start
    return { 
      success: true, 
      filePath, 
      bucket: STORAGE_BUCKET, 
      fileId: newFileRecord.id, 
      isVideoProcessing: videoProcessingInfo.isVideo,
      processingJobId: videoProcessingInfo.jobId,
      processingError: videoProcessingInfo.error
    };
  } catch (error) {
    console.error('Unexpected error during file upload:', error)
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}

// Extended InputFile type to add fields needed for our web application
// REMOVED: content field
// MODIFIED: type will now hold the specific MIME type
// ADDED: download_url to carry the signed URL
interface FileToProcess extends Omit<InputFile, 'image_data'> { // Exclude image_data if it exists in Baml InputFile
  type: string; // Specific MIME type (e.g., "image/jpeg", "audio/mpeg")
  path: string; // Supabase storage path (file_url from DB)
  bucket?: string; // Supabase storage bucket
  download_url?: string; // Signed URL for direct download by backend
  error?: string;
}

// Define task job status types
type TaskJobStatus = 'not_started' | 'pending' | 'processing' | 'completed' | 'failed';

// Re-export the BAML types for use in other files
export type EstimateItem = EstimateLineItem;
export type AIEstimate = ConstructionProjectData;

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

// REFACTORED: Calls postChatMessage after creating the thread
export async function createChatThreadAndPostMessage(
  projectId: string,
  userInput: BamlUserInput
): Promise<CreateChatResult> {
  const supabase = await createClient();
  const now = new Date();
  let newThreadId = '';

  try {
    // 1. Create the new chat thread
    const firstWords = userInput.message.split(' ').slice(0, 5).join(' ');
    let defaultName = firstWords || `Chat - ${now.toISOString().split('T')[0]}`;
    if (defaultName.length > 50) {
        defaultName = defaultName.substring(0, 47) + '...';
    }

    const { data: newThread, error: newThreadError } = await supabase
      .from('chat_threads')
      .insert({ project_id: projectId, name: defaultName })
      .select('id')
      .single();

    if (newThreadError || !newThread) {
      console.error('Error creating chat thread:', newThreadError);
      // Don't return full CreateChatResult shape here, just throw
      throw new Error(`Failed to create chat thread: ${newThreadError?.message || 'Unknown error'}`);
    }
    newThreadId = newThread.id;

    // 2. Call postChatMessage to handle saving the user input and getting the AI response
    const postResult = await postChatMessage(newThreadId, projectId, userInput);

    // 3. Check for errors from postChatMessage
    if (postResult.error) {
      // If posting the message failed, attempt to delete the newly created thread
      console.warn(`Initial message posting failed for thread ${newThreadId}. Attempting cleanup.`);
      try {
        await supabase.from('chat_threads').delete().eq('id', newThreadId);
        console.log(`Cleaned up created thread ${newThreadId} after message post failure.`);
      } catch (cleanupError) {
        console.error(`Failed to cleanup thread ${newThreadId} after message post failure:`, cleanupError);
        // Log cleanup error but proceed with returning the original post error
      }
      // Return an error result consistent with CreateChatResult shape
       return {
         newThreadId: '', // Indicate thread creation ultimately failed due to post error
         userInputDisplayEvent: postResult.userInputDisplayEvent, // May be a temporary event if save failed
         assistantResponseDisplayEvent: postResult.assistantResponseDisplayEvent, // Could be undefined
         updateTriggered: postResult.updateTriggered, // Likely false
         error: postResult.error,
       };
    }

    // 4. Revalidate path on full success
    revalidatePath(`/projects/${projectId}`);

    // 5. Return success state including the newThreadId
    return {
      newThreadId,
      userInputDisplayEvent: postResult.userInputDisplayEvent, // From postChatMessage
      assistantResponseDisplayEvent: postResult.assistantResponseDisplayEvent, // From postChatMessage
      updateTriggered: postResult.updateTriggered, // From postChatMessage
    };

  } catch (error) {
    console.error('Error in createChatThreadAndPostMessage:', error);
    
    // If the error occurred after thread creation (e.g., postChatMessage threw unexpectedly)
    // but before postChatMessage returned an error object handled above.
    if (newThreadId) {
       try {
            await supabase.from('chat_threads').delete().eq('id', newThreadId);
            console.log(`Cleaned up thread ${newThreadId} due to error during creation/post sequence.`);
       } catch (cleanupError) {
            console.error(`Failed to cleanup thread ${newThreadId} after error:`, cleanupError);
       }
     }

    // Return error state - provide a default user input object for consistency
    const defaultUserInputDisplayEvent = { 
      id: `temp-error-catch-${Date.now()}`, 
      type: "UserInput" as AllowedTypes, // CAST
      data: userInput, 
      createdAt: now.toISOString() 
    };

    return {
      newThreadId: '', // No valid thread ID
      userInputDisplayEvent: defaultUserInputDisplayEvent, 
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

    // 2.5 Fetch current estimate
     const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('ai_estimate')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('Error fetching project estimate for chat:', projectError);
      return { userInputDisplayEvent, updateTriggered: false, error: 'Failed to fetch project estimate for chat.' };
    }

    let currentEstimate: ConstructionProjectData | null = null;
    if (project?.ai_estimate) {
      try {
        currentEstimate = JSON.parse(project.ai_estimate as string);
      } catch (parseError) {
        console.error('Error parsing current estimate JSON:', parseError);
         // Decide how to handle - proceed without estimate? Return error?
        // For now, proceeding without, but logging the error.
      }
    }

    const bamlEventsForProcessing: BamlEvent[] = (dbEvents || []).map(dbEvent => ({
      type: dbEvent.event_type as AllowedTypes,
      data: dbEvent.data as any,
    }));

    const currentThreadState: BamlChatThread = { events: bamlEventsForProcessing };

    // 3. Call BAML
    let nextBamlEventOutput: BamlEvent;
    try {
        // Ensure currentEstimate is not null before passing, BAML might require it
        // Assuming BAML handles null or we pass an empty object if needed.
        nextBamlEventOutput = await b.DetermineNextStep(currentThreadState, currentEstimate as ConstructionProjectData ?? undefined);
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

    // Map UploadedFile to FileToProcess, now including MIME type and generating signed URL
    const supabaseForUrls = await createClient(); // Create client specifically for URL generation
    const filesToProcessPromises: Promise<FileToProcess>[] = uploadedFiles.map(async (file): Promise<FileToProcess> => {
      // USE the stored file.type directly, falling back if it happens to be null/undefined.
      const mimeTypeToUse = file.type || 'application/octet-stream';

      // Generate signed URL
      let downloadUrl: string | undefined = undefined;
      let fileError: string | undefined = undefined;
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabaseForUrls.storage
          .from(STORAGE_BUCKET) // Use constant or file.bucket if available
          .createSignedUrl(file.file_url, 3600); // 1 hour expiration

        if (signedUrlError) {
          console.error(`Error creating signed URL for ${file.file_name}:`, signedUrlError);
          fileError = `Failed to create signed URL: ${signedUrlError.message}`;
        } else {
          downloadUrl = signedUrlData.signedUrl;
        }
      } catch (urlError) {
         console.error(`Unexpected error generating signed URL for ${file.file_name}:`, urlError);
         fileError = urlError instanceof Error ? urlError.message : 'Unknown error generating signed URL';
      }

      return {
        type: mimeTypeToUse, // Use the stored MIME type
        name: file.file_name,
        description: file.description || '',
        path: file.file_url,
        bucket: STORAGE_BUCKET,
        download_url: downloadUrl,
        error: fileError // Store potential URL generation error
      };
    });

    const filesToProcess = await Promise.all(filesToProcessPromises);

    // Check for failures in generating signed URLs
    const filesWithUrlErrors = filesToProcess.filter(file => file.error);
    if (filesWithUrlErrors.length > 0) {
      const errorDetails = filesWithUrlErrors.map(f => `${f.name}: ${f.error}`).join('; ');
      return {
        error: `Failed to prepare ${filesWithUrlErrors.length} file(s) for processing: ${errorDetails}`,
        failedFiles: filesWithUrlErrors
      };
    }

    // REMOVED: Call to processFilesForInput as content fetching is moved to backend.
    // const processedFiles = await processFilesForInput(filesToProcess) // Pass the newly mapped files
    // The backend will now use the download_url directly.
    const processedFiles = filesToProcess; // Use files with download_urls directly

    // Check for failures in processed files (this check might be less relevant now, but kept for structure)
    // This check was originally for content fetching, which is removed.
    // It now primarily checks if download_url failed to generate (handled above).
    const failedFiles = processedFiles.filter(file => file.error);

    if (failedFiles.length > 0) {
      const failedFileNames = failedFiles.map(f => f.name).join(', ');
      const errorMessages = failedFiles.map(f => f.error).join('; ');
      return {
        error: `Failed to prepare download URLs for ${failedFiles.length} file(s): ${failedFileNames}. Errors: ${errorMessages}`,
        failedFiles
      };
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

    // Create the input state - sending files with download_url and specific MIME type
    const inputState = {
      files: processedFiles.map(({ path, bucket, error, ...rest }) => rest), // Send relevant fields: name, description, type (mime), download_url
      existing_estimate: project.ai_estimate ? JSON.parse(project.ai_estimate) : null,
      requested_changes: requested_changes
    };

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

// +++ START VIDEO PROCESSING ADDITIONS +++
export async function startVideoProcessing(
  projectId: string,
  fileId: string // ID of the original video file in the 'files' table
) {
  const supabase = await createClient()
  if (!LANGGRAPH_API_URL || !LANGGRAPH_API_KEY) {
    return { error: 'Video processing service is not configured.' };
  }

  try {
    // 1. Fetch the original video file record from Supabase
    const { data: videoFileRow, error: fileError } = await supabase
      .from('files')
      .select('file_name, file_url, description, type')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .single();

    if (fileError || !videoFileRow) {
      console.error('Error fetching video file for processing:', fileError);
      return { error: `Failed to find video file (ID: ${fileId}) for project ${projectId}.` };
    }

    // 2. Create a signed URL for the video file for LangGraph to access
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(videoFileRow.file_url, 3600); // 1 hour expiration

    if (signedUrlError || !signedUrlData) {
      console.error('Error creating signed URL for video processing:', signedUrlError);
      return { error: `Failed to create signed URL for video: ${signedUrlError?.message}` };
    }

    // 3. Call LangGraph to create a thread
    const createThreadResponse = await fetch(`${LANGGRAPH_API_URL}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGGRAPH_API_KEY,
      },
      body: JSON.stringify({}), // Empty body usually sufficient for thread creation
    });

    if (!createThreadResponse.ok) {
      const errorText = await createThreadResponse.text();
      console.error('LangGraph thread creation failed:', errorText);
      return { error: `Video processing thread creation failed: ${createThreadResponse.status}` };
    }
    const threadResult = await createThreadResponse.json() as { thread_id: string };
    const langGraphThreadId = threadResult.thread_id;

    // 4. Prepare input for LangGraph video_processor run
    const langGraphInput = {
      project_id: projectId,
      parent_file_id: fileId,
      video_file: {
        name: videoFileRow.file_name,
        type: videoFileRow.type || 'video/mp4', // Ensure type is always a string, default if null/undefined from DB
        description: videoFileRow.description || undefined, 
        download_url: signedUrlData.signedUrl,
      },
    };

    // 5. Call LangGraph to start a run
    const createRunResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${langGraphThreadId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGGRAPH_API_KEY,
      },
      body: JSON.stringify({
        assistant_id: 'video_processor',
        input: langGraphInput,
      }),
    });

    if (!createRunResponse.ok) {
      const errorText = await createRunResponse.text();
      console.error('LangGraph run creation failed:', errorText);
      // TODO: Optionally, try to delete the LangGraph thread if run creation fails?
      return { error: `Video processing run creation failed: ${createRunResponse.status}` };
    }
    const runResult = await createRunResponse.json() as { run_id: string };
    const langGraphRunId = runResult.run_id;

    // 6. Insert a task_job record
    const { data: newTaskJob, error: jobError } = await supabase.from('task_jobs').insert({
      project_id: projectId,
      file_id: fileId, // Link to the original video file
      thread_id: langGraphThreadId,
      run_id: langGraphRunId,
      status: 'processing',
      job_type: 'video_process',
    }).select('id').single(); // Select the ID of the new task job

    if (jobError || !newTaskJob) {
      console.error('Error creating video processing task job:', jobError);
      // TODO: More robust error handling, e.g., alert if critical, attempt cleanup?
      return { error: `Failed to create task job: ${jobError?.message}` };
    }

    // Path revalidation will be done by uploadFile if called from there, or by UI trigger if called directly.
    // revalidatePath(`/projects/${projectId}`); 
    return { 
      success: true, 
      message: 'Video processing started.', 
      jobId: newTaskJob.id, // Return the new task_job ID
      run_id: langGraphRunId, 
      thread_id: langGraphThreadId 
    };

  } catch (error) {
    console.error('Unexpected error in startVideoProcessing:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred while starting video processing.' };
  }
}

export async function checkVideoProcessingStatus(jobId: string) {
  const supabase = await createClient();
  if (!LANGGRAPH_API_URL || !LANGGRAPH_API_KEY) {
    return { error: 'Video processing service is not configured.' };
  }

  try {
    // 1. Fetch the task_job record
    const { data: taskJob, error: taskJobError } = await supabase
      .from('task_jobs')
      .select('*, files(project_id)') // files(project_id) to get project_id for revalidation
      .eq('id', jobId)
      .eq('job_type', 'video_process')
      .single();

    if (taskJobError) {
      if (taskJobError.code === 'PGRST116') { // No rows found
        return { status: 'not_found', error: `Job ID ${jobId} not found.` };
      }
      console.error('Error fetching video processing task job:', taskJobError);
      return { error: `Failed to fetch task job: ${taskJobError.message}` };
    }

    if (taskJob.status === 'completed' || taskJob.status === 'failed') {
      return { status: taskJob.status as TaskJobStatus, error: taskJob.error_message };
    }

    // 2. Job is 'processing', check LangGraph run status and get output if successful by joining
    //    First, just check status without joining to see if it's even done.
    const lgStatusCheckResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${taskJob.thread_id}/runs/${taskJob.run_id}`, {
      headers: { 'x-api-key': LANGGRAPH_API_KEY },
    });

    if (!lgStatusCheckResponse.ok) {
      const errorText = await lgStatusCheckResponse.text();
      console.error('LangGraph status check failed (pre-join):', errorText);
      await updateTaskStatus(taskJob.id, 'failed', `LangGraph status check error: ${lgStatusCheckResponse.status}`);
      return { status: 'failed' as TaskJobStatus, error: `LangGraph status check error: ${lgStatusCheckResponse.status}` };
    }

    const langGraphRunStatus = await lgStatusCheckResponse.json() as { status: string };

    if (langGraphRunStatus.status === 'success') {
      // Now that status is success, join to get the full output
      const lgJoinResponse = await fetch(`${LANGGRAPH_API_URL}/threads/${taskJob.thread_id}/runs/${taskJob.run_id}/join`, {
        headers: { 'x-api-key': LANGGRAPH_API_KEY },
      });

      if (!lgJoinResponse.ok) {
        const errorText = await lgJoinResponse.text();
        console.error('LangGraph join run failed:', errorText);
        await updateTaskStatus(taskJob.id, 'failed', `LangGraph join run error: ${lgJoinResponse.status}`);
        return { status: 'failed' as TaskJobStatus, error: `LangGraph join run error: ${lgJoinResponse.status}` };
      }

      // Expecting the output to be { analysis: VideoAnalysis, extracted_frames: InputFile[] }
      const langGraphRunOutput = await lgJoinResponse.json() as { analysis: VideoAnalysis; extracted_frames: InputFile[], parent_file_id: string, project_id: string } | null ;

      if (!langGraphRunOutput || !langGraphRunOutput.analysis || !langGraphRunOutput.extracted_frames) {
        console.error('LangGraph run output is missing expected fields (analysis, extracted_frames).', langGraphRunOutput);
        await updateTaskStatus(taskJob.id, 'failed', 'LangGraph output format error.');
        return { status: 'failed'as TaskJobStatus, error: 'LangGraph output format error.' };
      }
      
      // 3. LangGraph run succeeded, process the output
      const output = langGraphRunOutput;
      const originalVideoFileId = output.parent_file_id;
      let projectIdToUse = output.project_id;
      if (!projectIdToUse) {
        projectIdToUse = taskJob.project_id;
      }

      if (!originalVideoFileId || !projectIdToUse) {
          console.error('Missing originalVideoFileId or projectId for processing video results', { originalVideoFileId, projectIdToUse, taskJob });
          await updateTaskStatus(taskJob.id, 'failed', 'Internal error: Missing context for result processing.');
          return { status: 'failed' as TaskJobStatus, error: 'Internal error processing results.'};
      }

      // Fetch the original video's filename for the summary
      const { data: originalVideoDetails, error: originalVideoDetailsError } = await supabase
        .from('files')
        .select('file_name')
        .eq('id', originalVideoFileId)
        .single();

      if (originalVideoDetailsError || !originalVideoDetails) {
        console.error('Failed to fetch original video filename for summary:', originalVideoDetailsError);
        await updateTaskStatus(taskJob.id, 'failed', 'Failed to retrieve original video details for summary.');
        return { status: 'failed' as TaskJobStatus, error: 'Failed to process results (original video details).' };
      }
      
      const baseOriginalFileName = originalVideoDetails.file_name.split('.').slice(0, -1).join('.') || originalVideoDetails.file_name;
      const sanitizedBaseOriginalFileName = baseOriginalFileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100); // Keep it reasonably short
      const summaryFileName = `video_summary_${sanitizedBaseOriginalFileName}.txt`;
      
      // 3a. Upload summary text to Supabase Storage
      // Path for AI generated content, includes original file ID for association and now original name for readability
      const summaryStoragePath = `${projectIdToUse}/ai_generated/${originalVideoFileId}/${summaryFileName}`;
      
      const { error: summaryUploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(summaryStoragePath, output.analysis.detailed_description, { contentType: 'text/plain', upsert: true });

      if (summaryUploadError) {
        console.error('Error uploading video summary text:', summaryUploadError);
        await updateTaskStatus(taskJob.id, 'failed', `Failed to upload summary: ${summaryUploadError.message}`);
        return { status: 'failed' as TaskJobStatus, error: `Failed to save summary: ${summaryUploadError.message}` };
      }

      // 3b. Create files table entries
      const newFileEntries = [];
      // Summary file entry
      newFileEntries.push({
        project_id: projectIdToUse,
        parent_file_id: originalVideoFileId,
        file_name: summaryFileName,
        description: `AI-generated video summary of ${originalVideoDetails.file_name}`,
        file_url: summaryStoragePath, // Store the storage path
        type: 'text/plain',
        origin: 'ai',
      });

      // Frame file entries
      for (const frameFile of output.extracted_frames) {
        newFileEntries.push({
          project_id: projectIdToUse,
          parent_file_id: originalVideoFileId,
          file_name: frameFile.name, // Name from LangGraph output (includes UUID)
          description: frameFile.description || 'AI-generated video frame',
          file_url: frameFile.download_url, // This is the storage path from LangGraph
          type: frameFile.type || 'image/png', // Use type from LangGraph if available
          origin: 'ai',
        });
      }

      const { error: insertFilesError } = await supabase.from('files').insert(newFileEntries);
      if (insertFilesError) {
        console.error('Error inserting AI-generated file records:', insertFilesError);
        // Attempt to clean up summary file from storage?
        await supabase.storage.from(STORAGE_BUCKET).remove([summaryStoragePath]);
        await updateTaskStatus(taskJob.id, 'failed', `Failed to save processed file records: ${insertFilesError.message}`);
        return { status: 'failed' as TaskJobStatus, error: `Failed to save file records: ${insertFilesError.message}` };
      }

      // 3c. Update task_job to completed
      await updateTaskStatus(taskJob.id, 'completed');
      revalidatePath(`/projects/${projectIdToUse}`);
      return { status: 'completed' as TaskJobStatus };

    } else if (['error', 'timeout', 'interrupted'].includes(langGraphRunStatus.status)) {
      // 4. LangGraph run failed
      const failureMessage = `Video processing failed in LangGraph with status: ${langGraphRunStatus.status}`;
      console.error(failureMessage, langGraphRunStatus.status); // Log output if any
      await updateTaskStatus(taskJob.id, 'failed', failureMessage);
      return { status: 'failed' as TaskJobStatus, error: failureMessage };
    } else {
      // 5. LangGraph run is still pending/processing (based on initial status check)
      return { status: langGraphRunStatus.status as TaskJobStatus }; // Return the actual status like 'pending' or 'processing'
    }

  } catch (error) {
    console.error('Unexpected error in checkVideoProcessingStatus:', error);
    // If jobId is available, try to mark task as failed
    // const currentJobId = (error as any)?.jobIdForError; // A way to pass jobId if needed
    // if (currentJobId) { await updateTaskStatus(currentJobId, 'failed', 'Unexpected check status error.'); }
    return { error: error instanceof Error ? error.message : 'An unknown error occurred while checking video processing status.' };
  }
}

// +++ END VIDEO PROCESSING ADDITIONS +++

/**
 * Delete a file and its associated files (if it's a video with AI-generated files)
 * Also removes the files from Supabase storage
 */
export async function deleteFile(fileId: string) {
  const supabase = await createClient();

  try {
    // First, retrieve the file to get its file_url and check if it's a parent file
    const { data: fileToDelete, error: fetchError } = await supabase
      .from('files')
      .select('file_url, project_id')
      .eq('id', fileId)
      .single();

    if (fetchError) {
      console.error('Error fetching file for deletion:', fetchError);
      return { error: `Failed to find file with ID ${fileId}` };
    }

    // Next, find any AI-generated child files associated with this file
    const { data: childFiles, error: childFilesError } = await supabase
      .from('files')
      .select('id, file_url')
      .eq('parent_file_id', fileId);

    if (childFilesError) {
      console.error('Error fetching child files:', childFilesError);
      // Proceed with deleting the main file even if we can't find children
    }

    // Gather all storage paths to delete
    const storagePaths: string[] = [fileToDelete.file_url];

    // Add child file paths to delete list
    if (childFiles && childFiles.length > 0) {
      childFiles.forEach(childFile => {
        if (childFile.file_url) {
          storagePaths.push(childFile.file_url);
        }
      });

      // Delete child file records
      const { error: deleteChildrenError } = await supabase
        .from('files')
        .delete()
        .eq('parent_file_id', fileId);

      if (deleteChildrenError) {
        console.error('Error deleting child file records:', deleteChildrenError);
        return { error: 'Failed to delete associated files' };
      }
    }

    // Deleting the main file record will trigger ON DELETE CASCADE for associated task_jobs
    const { error: deleteFileError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (deleteFileError) {
      console.error('Error deleting file record:', deleteFileError);
      return { error: 'Failed to delete file record' };
    }

    // Finally, remove the files from storage (in batches if there are many)
    const MAX_BATCH_SIZE = 100;

    for (let i = 0; i < storagePaths.length; i += MAX_BATCH_SIZE) {
      const batch = storagePaths.slice(i, i + MAX_BATCH_SIZE);
      try {
        // Ignore removal errors as files might not exist in storage
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(batch);

        if (storageError) {
          console.warn(`Storage removal warning for batch ${i}:`, storageError);
          // Continue with deletion
        }
      } catch (err) {
        console.warn(`Error during storage removal for batch ${i}:`, err);
        // Continue with deletion
      }
    }

    revalidatePath(`/projects/${fileToDelete.project_id}`);
    return { success: true };

  } catch (error) {
    console.error('Unexpected error deleting file:', error);
    return { error: error instanceof Error ? error.message : 'An unknown error occurred while deleting file' };
  }
}

