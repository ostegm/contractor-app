# Plan for Integrating BAML Chat Functionality

This document outlines the steps to integrate the BAML-powered chat functionality into the application. The chat allows users to interact with an assistant, which can trigger project estimate updates.

## I. Database Schema Updates (Supabase)

We need to introduce new tables for chat threads and events, and modify the existing `task_jobs` table.

### A. `chat_threads` Table

This table will store individual chat conversations.

**Migration SQL (New file: `supabase/migrations/YYYYMMDD_HHMM_add_chat_tables.sql` where YYYYMMDD_HHMM is the current date and time):**
```sql
CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TRIGGER update_chat_threads_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_chat_threads_project_id ON chat_threads(project_id);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chat threads for their projects" ON chat_threads
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = chat_threads.project_id
        AND projects.user_id = auth.uid()
    ));
```

### B. `chat_events` Table

This table will store all events within a chat thread (user messages, assistant responses, estimate update requests/responses).

**Migration SQL (append to `YYYYMMDD_HHMM_add_chat_tables.sql`):**
```sql
-- Define chat_event_type enum based on BAML AllowedTypes
CREATE TYPE chat_event_type AS ENUM (
    'UserInput',
    'AssisantMessage',
    'UpdateEstimateRequest',
    'UpdateEstimateResponse'
);

CREATE TABLE chat_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    event_type chat_event_type NOT NULL,
    -- Store structured event data based on BAML types
    -- UserInput: { message: string }
    -- AssisantMessage: { message: string }
    -- UpdateEstimateRequest: { changes_to_make: string }
    -- UpdateEstimateResponse: { success: bool, error_message: string }
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_chat_events_thread_id ON chat_events(thread_id);
CREATE INDEX idx_chat_events_created_at ON chat_events(created_at); -- For polling

ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chat events for their project threads" ON chat_events
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM chat_threads
        WHERE chat_threads.id = chat_events.thread_id
        AND EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = chat_threads.project_id
            AND projects.user_id = auth.uid()
        )
    ));
```

### C. Modify `task_jobs` Table

Add a column to link task jobs back to the chat thread that initiated them.

**Migration SQL (New file: `supabase/migrations/YYYYMMDD_HHMM_add_originating_chat_to_tasks.sql`  where YYYYMMDD_HHMM is the current date and time, slightly after the chat_tables migration):**
```sql
-- Add originating_chat_thread_id to task_jobs table
ALTER TABLE task_jobs
ADD COLUMN originating_chat_thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL;

-- Create index for the new column
CREATE INDEX idx_task_jobs_originating_chat_thread_id ON task_jobs(originating_chat_thread_id);

-- RLS policies for task_jobs are already in place (in 20240505_1200_add_task_jobs_table.sql)
-- and should cover this new nullable column as they are primarily based on project_id.
-- No changes to RLS are immediately needed unless specific access patterns for this new column arise.
```

## II. Backend Implementation (Next.js Server Actions)

Location: `apps/web/app/projects/[id]/actions.ts`

### A. BAML Client Setup & Types
Import the BAML client and necessary types.
```typescript
import { b } from '@/baml_client/baml_client'; // Adjust path if necessary
import type { 
  UserInput as BamlUserInput, 
  AssisantMessage as BamlAssistantMessage, 
  UpdateEstimateRequest as BamlUpdateEstimateRequest, 
  UpdateEstimateResponse as BamlUpdateEstimateResponse, 
  Event as BamlEvent, 
  BamlChatThread, 
  AllowedTypes 
} from '@/baml_client/baml_client/types';

// Define a richer event type for UI display and DB interactions
export interface DisplayableBamlEvent {
  id: string; // Database ID for the event, useful for React keys
  type: AllowedTypes;
  data: BamlUserInput | BamlAssistantMessage | BamlUpdateEstimateRequest | BamlUpdateEstimateResponse;
  createdAt: string; // ISO string timestamp from the database
}
```

### B. New Server Action: `getOrCreateChatThread`
To fetch or create a chat thread for a project, along with its events.
```typescript
export async function getOrCreateChatThread(projectId: string): Promise<{ threadId: string; events: DisplayableBamlEvent[] }> {
  const supabase = await createClient();
  let { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('project_id', projectId)
    .single();

  if (threadError && threadError.code !== 'PGRST116') { // PGRST116: No rows found
    console.error('Error fetching chat thread:', threadError);
    throw new Error('Failed to fetch chat thread.');
  }

  if (!thread) {
    const { data: newThread, error: newThreadError } = await supabase
      .from('chat_threads')
      .insert({ project_id: projectId })
      .select('id')
      .single();
    if (newThreadError || !newThread) {
      console.error('Error creating chat thread:', newThreadError);
      throw new Error('Failed to create chat thread.');
    }
    thread = newThread;
    return { threadId: thread.id, events: [] }; // No events for a new thread
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
    type: e.event_type as AllowedTypes, // DB enum must match Baml AllowedTypes
    data: e.data as any, // Data structure in DB must match Baml event data types
    createdAt: e.created_at,
  }));

  return { threadId: thread.id, events: displayableEvents };
}
```

### C. New Server Action: `postChatMessage`

Handles new user messages, calls BAML, and processes the response.

```typescript
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
    event_type: 'UserInput' as AllowedTypes,
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
      // Construct a temporary event for display if save fails, though this is problematic
      userInputDisplayEvent: { id: 'temp-error', type: AllowedTypes.UserInput, data: userInput, createdAt: now },
      updateTriggered: false, 
      error: 'Failed to save user message.' 
    };
  }
  
  const userInputDisplayEvent: DisplayableBamlEvent = {
    id: savedUserInput.id,
    type: AllowedTypes.UserInput,
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
  let nextBamlEventOutput: BamlEvent; // This is the event from BAML function
  try {
    nextBamlEventOutput = await b.DetermineNextStep(currentThreadState);
  } catch (bamlError) {
    console.error('BAML DetermineNextStep error:', bamlError);
    return { userInputDisplayEvent, updateTriggered: false, error: 'AI failed to determine next step.' };
  }

  // 4. Save the event returned by BAML
  const bamlEventToSave = {
    thread_id: threadId,
    event_type: nextBamlEventOutput.type as AllowedTypes,
    data: nextBamlEventOutput.data,
  };
  const { data: savedBamlEvent, error: bamlEventSaveError } = await supabase
    .from('chat_events')
    .insert(bamlEventToSave)
    .select('id, created_at')
    .single();

  if (bamlEventSaveError || !savedBamlEvent) {
    console.error('Error saving BAML event:', bamlEventSaveError);
    // UI will get the BAML response, but it wasn't saved. This is a partial failure.
    // Consider how to handle this. For now, return what BAML produced.
     return { 
      userInputDisplayEvent,
      // Construct a temporary event if save fails
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
  if (nextBamlEventOutput.type === AllowedTypes.UpdateEstimateRequest) {
    const requestData = nextBamlEventOutput.data as BamlUpdateEstimateRequest;
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
```

### D. Modify `startEstimateGeneration`

Add `originatingChatThreadId` parameter and use it when creating `task_jobs`.

```typescript
// In apps/web/app/projects/[id]/actions.ts

// Modify the signature
export async function startEstimateGeneration(
  projectId: string,
  requested_changes?: string,
  originatingChatThreadId?: string // New parameter
) {
  // ... existing code ...

  try {
    // ... existing setup ...
    // ... existing file processing ...
    // ... existing thread creation for LangGraph ...
    // ... existing run creation for LangGraph ...

    // Modify task_job insertion
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

    // ... rest of the function ...
//highlight-next-line
  } catch (error) {
    // ... existing error handling ...
    console.error('Error starting estimate generation:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}
```

### E. Modify `processCompletedRun` and `checkEstimateStatus` for Chat Feedback

When an estimate generation task finishes, post an `UpdateEstimateResponse` event.

Helper function:
```typescript
// In apps/web/app/projects/[id]/actions.ts

async function recordChatEstimateUpdateResponse(
  originatingChatThreadId: string,
  success: boolean,
  errorMessage?: string // Optional error message
) {
  const supabase = await createClient();
  const responseData: BamlUpdateEstimateResponse = {
    success,
    // BAML type UpdateEstimateResponse { success: boolean, error_message: string }
    // Ensure error_message is always a string.
    error_message: success ? '' : (errorMessage || 'Estimate update failed due to an unknown reason.'),
  };

  const { error } = await supabase.from('chat_events').insert({
    thread_id: originatingChatThreadId,
    event_type: 'UpdateEstimateResponse' as AllowedTypes, // Match DB enum/check
    data: responseData,
  });

  if (error) {
    console.error('Error recording UpdateEstimateResponse to chat:', error);
  }
}

// Modify processCompletedRun
async function processCompletedRun(threadId: string, runId: string, projectId: string, taskJobId: string) {
  let success = false;
  let detailedErrorMessage: string | undefined;
  try {
    // ... (existing logic to join run and get result) ...
    // const result = await joinResponse.json(); // Assume this is done
    // const aiEstimate = extractAIEstimate(result);
    // if (aiEstimate) {
    //   await updateProjectEstimate(projectId, aiEstimate);
    // }
    // ...
    // For this example, let's assume the above logic sets a local success/failure
    // For instance, if joinResponse.ok is false:
    // if (!joinResponse.ok) { /* ... set detailedErrorMessage, throw ... */ }

    // Placeholder for actual estimate extraction and update:
    const joinResponse = await fetch(/* ... */); // Simplified
    if (joinResponse.ok) {
        const result = await joinResponse.json();
        const aiEstimate = extractAIEstimate(result);
        if (aiEstimate) {
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
    // --- End Placeholder ---


    if (success) {
        await updateTaskStatus(taskJobId, 'completed');
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
  const supabase = await createClient(); // Re-init if needed or pass down
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
  
  // return { success }; // processCompletedRun might not need to return success if it's a fire-and-forget processor
}


// Modify checkEstimateStatus for failure cases and to trigger chat update
export async function checkEstimateStatus(projectId: string) {
  // ... (existing try-catch and supabase client)
  const supabase = await createClient(); // Ensure it's initialized
  try {
    const { data: taskJob, error: taskJobError } = await supabase
      .from('task_jobs')
      // ... (existing query)
      .single();

    // ... (existing error handling for taskJobError)
    if (taskJobError) {
      if (taskJobError.code === 'PGRST116') {
        return { status: 'not_started' as TaskJobStatus };
      }
      console.error('Error fetching task job:', taskJobError);
      return { error: 'Failed to fetch task status' };
    }


    if (taskJob.status === 'completed' || taskJob.status === 'failed') {
      // No need to re-notify chat here, it should have been done when status transitioned.
      return { 
        status: taskJob.status as TaskJobStatus,
        error: taskJob.error_message // This is the error_message from task_jobs table
      };
    }

    // ... (existing API call to LangGraph)
    const response = await fetch(/* ... */);
    // ... (existing handling if !response.ok before 404)
     if (!response.ok) {
      if (response.status === 404) {
        const apiErrorMsg = 'Run not found in LangGraph API';
        await updateTaskStatus(taskJob.id, 'failed', apiErrorMsg);
        if (taskJob.originating_chat_thread_id) {
          await recordChatEstimateUpdateResponse(taskJob.originating_chat_thread_id, false, apiErrorMsg);
        }
        return { status: 'failed' as TaskJobStatus, error: apiErrorMsg };
      }
      // ... other non-404 errors
    }


    const runStatus = await response.json() as { status: string };

    switch (runStatus.status) {
      case 'success':
        // processCompletedRun will handle updating task status and chat.
        // It's called here but should be robust.
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
      
      // ... (default case)
    }
  } catch (error) {
    // ... (existing error handling)
    console.error('Error checking estimate status:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}
```

### F. Server Action: `getChatEvents` (for polling updates)

```typescript
// In apps/web/app/projects/[id]/actions.ts
// Returns DisplayableBamlEvent[]
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
    throw new Error('Failed to fetch chat events.'); // Or return { error: ... }
  }

  return (dbEvents || []).map(e => ({
    id: e.id,
    type: e.event_type as AllowedTypes,
    data: e.data as any, 
    createdAt: e.created_at,
  }));
}
```

## III. Frontend Implementation (React Components)

Example Location: `apps/web/app/projects/[id]/components/ChatInterface.tsx`

### A. `ChatInterface.tsx` Component Sketch

*   **State:**
    *   `threadId: string | null`
    *   `events: DisplayableBamlEvent[]`
    *   `newMessage: string` (for input field)
    *   `isSending: boolean` (for user message submission)
    *   `isAssistantUpdatingEstimate: boolean` (tracks if an `UpdateEstimateRequest` is active and not yet responded to by `UpdateEstimateResponse`)
    *   `error: string | null` (for displaying errors)
*   **Effects:**
    *   On mount/`projectId` change: Call `getOrCreateChatThread` to load/initialize.
    *   Polling: Use `useEffect` with `setInterval` (or a library like SWR/React Query) to call `getChatEvents` periodically, passing the `createdAt` timestamp of the latest event to fetch only new ones. Merge new events into the `events` state.
*   **Functions:**
    *   `handleSendMessage`:
        *   Set `isSending = true`, clear `error`.
        *   Create `BamlUserInput` from `newMessage`.
        *   Call `postChatMessage` server action.
        *   On response:
            *   Add `userInputDisplayEvent` and `assistantResponseDisplayEvent` to `events` state.
            *   If `updateTriggered` is true (meaning an `UpdateEstimateRequest` was part of `assistantResponseDisplayEvent`), set `isAssistantUpdatingEstimate = true`.
            *   If an error occurred, set `error` state.
        *   Clear `newMessage`, set `isSending = false`.
    *   When new events arrive from polling (especially `UpdateEstimateResponse`):
        *   If an `UpdateEstimateResponse` is received, set `isAssistantUpdatingEstimate = false`.
*   **Rendering:**
    *   Map `events` to display styled chat bubbles (differentiating User/Assistant/System messages).
    *   Input field + send button (disabled when `isSending`).
    *   Display "Assistant is updating estimate..." when `isAssistantUpdatingEstimate` is true.
    *   Display general errors from `error` state.

### B. UI Considerations:

*   The main project estimate display (outside the chat component) will continue to update based on its existing polling of `checkEstimateStatus`.
*   The chat provides a conversational interface and an additional way to trigger these updates. The `UpdateEstimateResponse` in the chat log confirms the outcome of the chat-initiated request.

## IV. BAML Client Usage

*   Ensure the BAML client is correctly imported in `actions.ts`: `import { b } from '@/baml_client/baml_client';`
*   It's used in `postChatMessage` to call `await b.DetermineNextStep(currentThreadState);`.

## V. Testing Considerations

*   Test each event type flow.
*   Verify `originating_chat_thread_id` is correctly populated in `task_jobs`.
*   Confirm `UpdateEstimateResponse` events appear in chat after estimate completion/failure.
*   Test RLS for new tables and ensure existing `task_jobs` RLS isn't broken.
*   UI responsiveness, error handling, and optimistic updates (e.g., showing user message immediately).

This plan provides a comprehensive approach. Implementation should be iterative with testing at each stage. 