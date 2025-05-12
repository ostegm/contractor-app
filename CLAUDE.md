# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using baml
 - Review BAML.md as needed for details on how to work with baml files.

## Build & Test Commands
- Install dependencies: `pip install -e ".[dev]"`
- Generate BAML client: `baml generate`
- Run all tests: `pytest`
- Run single test: `pytest tests/path_to_test.py::test_function_name -v`
- Run tests with coverage: `pytest --cov=baml_client`
- Lint code: `ruff check .`
- Type check: `mypy .`

## Code Style Guidelines
- **Formatting**: Use Black for Python code formatting
- **Imports**: Group imports in this order: standard library, third-party, local application
- **Types**: Use type annotations for all functions and methods
- **Naming**: 
  - Classes: PascalCase
  - Functions/methods: snake_case
  - Constants: UPPER_SNAKE_CASE
  - BAML entities: PascalCase (functions, clients, classes)
- **Error Handling**: Use specific exceptions with helpful error messages
- **BAML Patterns**: Keep prompt templates clean and well-structured see BAML.md for details.
- **Tests**: Write test cases for all BAML functions to ensure prompt behavior

## Web UI Architecture Summary (for Claude)

This summarizes the key interactions within the Next.js web UI, particularly focusing on chat, estimates, loading states, and Supabase usage.

**1. Core Structure (`app-client-shell.tsx`)**

*   The main client shell manages the overall layout, including the `HeaderNav`, `ProjectSidebar`, and the main content area where pages like `ProjectPage` are rendered via `{children}`.
*   It determines the `currentProjectId` based on the URL pathname.
*   It controls the visibility and state of the `ChatPanel`.
*   It provides `ViewContext` which holds:
    *   `currentProjectView`: State for toggling between 'estimate' and 'files' views on the project page.
    *   `onEstimateUpdateTriggeredByChat` / `setOnEstimateUpdateTriggeredByChat`: A mechanism for `ProjectPage` to provide a callback function that `ChatPanel` can invoke when an estimate update is triggered via chat.

**2. Chat UX (`chat-panel.tsx`)**

*   Receives `projectId`, `threadId` (optional), and the `onEstimateUpdateTriggered` callback (via context originally from `ProjectPage`) from `AppClientShell`.
*   Manages its own state for the active chat thread (`activeThreadId`), messages/events (`events`), loading/sending states, and UI states like `isAssistantUpdatingEstimate`.
*   **Message Handling:**
    *   On send, if no `activeThreadId`, it calls `createChatThreadAndPostMessage` (server action).
    *   If `activeThreadId` exists, it calls `postChatMessage` (server action).
    *   Optimistically displays the user's message immediately.
    *   Replaces optimistic message with server-confirmed message upon successful response.
*   **Estimate Updates via Chat:**
    *   Server actions (`postChatMessage`, `createChatThreadAndPostMessage`) return `updateTriggered: true` if the AI determines an estimate update is needed.
    *   If `updateTriggered` is true, `ChatPanel` calls the `onEstimateUpdateTriggered` prop function. This function (originating from `ProjectPage`) sets the `estimateStatus` on the project page to `'processing'`, showing the loading state there.
    *   `ChatPanel` also sets its internal `isAssistantUpdatingEstimate` state to true when an `UpdateEstimateRequest` event is received/loaded. This state is cleared when a corresponding `UpdateEstimateResponse` event is received via polling.
*   **Event Display:**
    *   Renders different event types (`UserInput`, `AssisantMessage`, `UpdateEstimateRequest`, `UpdateEstimateResponse`).
    *   `UpdateEstimateRequest` events are displayed as "System: Agent updating estimate." and are collapsible to show/hide the detailed `changes_to_make` text.
    *   Successful `UpdateEstimateResponse` events show "System: Estimate updated.".
*   **Polling:** Polls the `getChatEvents` server action periodically to fetch new messages/events for the current `activeThreadId`.

**3. Project Page (`page.tsx`)**

*   Fetches project details (`projects` table) and files list (`files` table) from Supabase on load.
*   Displays either the 'estimate' view or the 'files' view based on `currentProjectView` from `ViewContext`.
*   **Estimate View:**
    *   Displays the current AI estimate (`ai_estimate` JSON field from `projects` table) if available.
    *   Shows loading/error states based on `estimateStatus` state:
        *   `'processing'`: Shows a loading indicator within the estimate area. This state is set either by clicking "Generate Estimate" OR by the `handleEstimateUpdateTriggered` callback (called via context from `ChatPanel`).
        *   `'failed'`: Shows an error message.
        *   `'completed'`: Shows the estimate details.
        *   `'not_started'`: Shows the "No Estimate Generated Yet" placeholder.
    *   Uses `useEffect` to poll `checkEstimateStatus` (server action) when `estimateStatus` is `'processing'`. This action checks the `task_jobs` table and the underlying LangGraph run status.
*   **Estimate Update Callback:**
    *   Defines `handleEstimateUpdateTriggered`.
    *   Uses `useEffect` and `setOnEstimateUpdateTriggeredByChat` from `ViewContext` to register this callback when the page mounts for a specific project ID and unregister it on cleanup.
*   **File Management:** Allows uploading files (`uploadFile` action -> Supabase Storage & `files` table) and adding notes (also saved as files).

**4. Backend Actions & Supabase (`actions.ts`)**

*   Server actions interact with Supabase using the server client.
*   **Key Tables:**
    *   `projects`: Stores project metadata and the JSON `ai_estimate`.
    *   `files`: Stores metadata about uploaded files (name, description, Supabase storage `file_url`).
    *   `chat_threads`: Stores chat thread metadata (linked to `project_id`).
    *   `chat_events`: Stores individual messages/events within a thread (linked to `thread_id`), including user input, assistant messages, and estimate update requests/responses. `data` column is JSONB.
    *   `task_jobs`: Tracks background jobs like estimate generation. Links `project_id`, LangGraph `thread_id`/`run_id`, job `status`, and `originating_chat_thread_id` (if triggered via chat).
*   **Estimate Generation Flow:**
    1.  `startEstimateGeneration` action is called (from `page.tsx` button or `_handleBamlResponse` in chat flow).
    2.  Fetches files, prepares input for LangGraph agent.
    3.  Calls LangGraph API to create a thread and start a run.
    4.  Inserts a record into `task_jobs` with status `'processing'`, storing LangGraph IDs and optionally the `originating_chat_thread_id`.
    5.  `checkEstimateStatus` action is polled by the UI (`page.tsx`).
    6.  `checkEstimateStatus` checks the corresponding `task_jobs` record and queries the LangGraph API for the run status.
    7.  If the run succeeded, `checkEstimateStatus` calls `processCompletedRun`.
    8.  `processCompletedRun` fetches the final result from LangGraph, extracts the estimate, calls `updateProjectEstimate` (updates `projects` table), and updates the `task_jobs` status to `'completed'`.
    9.  If the run failed, status is updated to `'failed'` in `task_jobs`.
    10. If the job originated from chat, `processCompletedRun` calls `recordChatEstimateUpdateResponse` to add the final `UpdateEstimateResponse` event to the `chat_events` table.
*   **Chat Flow:**
    1.  UI (`ChatPanel`) calls `postChatMessage` or `createChatThreadAndPostMessage`.
    2.  Actions save `UserInput` event to `chat_events`.
    3.  Actions fetch history from `chat_events` and current estimate from `projects`.
    4.  Actions call BAML `DetermineNextStep`.
    5.  Actions handle BAML response:
        *   Save `AssisantMessage` to `chat_events`.
        *   OR, if `UpdateEstimateRequest`, save event and call `startEstimateGeneration`, passing the `originating_chat_thread_id`. Return `updateTriggered: true`.