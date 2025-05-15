# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview
The Contractor App helps contractors generate detailed project estimates using AI. It analyzes project files (images, notes, audio, video) to create structured cost estimates with line items, timelines, and more. Users can refine estimates via an AI chat assistant.

## Architecture
- **Web UI (Next.js 13+)**: `apps/web/` - React app with App Router, Server Components, and Server Actions.
- **AI Service (LangGraph)**: `apps/langgraph/` - Python service handling AI requests using BAML.
- **BAML Definitions**: `baml_src/` - Schema and prompt definitions for AI interactions.
- **Database & Storage (Supabase)**: Postgres DB, file storage, and authentication.

## Build & Test Commands
### Web App (`apps/web/`)
- Development: `npm run dev`
- Lint: `npm run lint`
- Test: `npm run test`

### LangGraph/Python (`apps/langgraph/` or root for `baml generate`)
- Install: `pip install -e ".[dev]"`
- Generate BAML client: `baml generate`
- Run tests: `pytest`
- Lint: `ruff check .`
- Type check: `mypy .`

## Code Style Guidelines
- **TypeScript/Next.js**: Strict type checking, React Server Components & Server Actions, TailwindCSS with shadcn/ui. Error handling: return structured `{error?: string, success?: boolean}`.
- **Python/BAML**: Black formatting, type annotations. PascalCase for classes/BAML entities, snake_case for functions. Clean, well-structured prompt templates.

## Core Functionality
The Contractor App streamlines project estimation by:
*   **Project Data Input**: Users create projects and upload descriptions, client requirements, and supporting files (sketches, photos, notes, audio).
*   **AI-Powered Estimate Generation**: The app sends project data to an AI assistant that returns a structured JSON estimate (summary, cost range, timeline, line items, risks, missing info). Each `EstimateLineItem` in the JSON includes a stable `uid` (UUID), crucial for later edits.
*   **Interactive Refinement via Chat**: A chat interface allows users to ask questions or request changes. The AI can answer or trigger an estimate update (either a full regeneration or a fast patch).
*   **Project Management**: Data (files, estimate, chat history) is persisted in Supabase.

## Web UI Architecture and Operation (`apps/web/`)

**Tech Stack & Organization**: Built with Next.js 13 (App Router, React Server Components, Server Actions).
**Layout**: Main layout (`AppClientShell`) with top navigation, project-specific sidebar (toggling Estimate/Files views), and `ViewContext` for shared state.
**Project Dashboard (`app/dashboard/page.tsx`)**: Lists user's projects (from Supabase); allows creating new or selecting existing projects.
**Project Page (`/projects/[id]`)**:
*   **Estimate View**: Displays the AI-generated `ai_estimate` JSON. Shows loading/error states during generation. Has a "Generate Estimate" button.
*   **Files View**: Lists project files from Supabase `files` table. Allows new uploads (handled by `uploadFile` server action).
**Chat Panel (`ChatPanel` component)**:
*   Contextual to the current project. Manages chat threads.
*   User messages trigger server actions (`createChatThreadAndPostMessage` or `postChatMessage`) which save to `chat_events` and invoke AI for a reply.
*   Handles events like `UpdateEstimateRequest` (triggers full regeneration, shows "Agent is updating...") or `PatchEstimateRequest` (triggers fast client-side patch, shows "⚡ Quick patch...").
*   UI updates based on `UpdateEstimateResponse` or `PatchEstimateResponse`.
**Server Actions (`actions.ts`)**:
*   `uploadFile`: Saves file to Supabase Storage and `files` table.
*   `startEstimateGeneration`: Gathers files, gets signed URLs, calls LangGraph API to start an AI run, records job in `task_jobs`.
*   `checkEstimateStatus`: Polls `task_jobs` and LangGraph for job status. On completion, processes results, updates `projects.ai_estimate`.
*   Chat actions (`createChatThreadAndPostMessage`, `postChatMessage`): Handle messaging and AI interaction.
*   `applyPatchAndPersist` (new, for fast edits): Receives `PatchEstimateRequest`, applies JSON patches (RFC-6902 style) to the stored `ai_estimate` using `fast-json-patch`. Validates schema. If successful and few patches, persists and emits `PatchEstimateResponse`. Falls back to full re-estimate (`UpdateEstimateRequest`) on failure or too many patches.

## Supabase Integration

**Role**: Primary backend for data persistence (Postgres), user management (Auth), and file storage.
**User Authentication**: Manages user accounts and login. Projects and resources are linked to `user_id`.
**Database Schema**:
| Table          | Purpose                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `projects`     | Project info, `ai_estimate` (JSON with UIDs in line items).                                            |
| `files`        | Metadata for project files; `file_url` points to Supabase Storage.                                     |
| `chat_threads` | Chat sessions per project.                                                                             |
| `chat_events`  | Individual messages/events in chat threads (e.g., `UserInput`, `AssisantMessage`, `UpdateEstimateRequest`, `PatchEstimateRequest`, etc.). |
| `task_jobs`    | Tracks asynchronous AI estimate generation jobs (`status`: "processing", "completed", "failed").       |
**File Storage**: Stores uploaded files. `startEstimateGeneration` creates short-lived signed URLs for LangGraph to access files directly.
**Data Access**: Primarily via server actions using a Supabase client with service-role access.

## LangGraph Service and LLM Integration (`apps/langgraph/`)

**Role**: Separate Python service handling AI model interactions and complex computations.
**Communication**: Exposes an HTTP API (e.g., `/threads`, `/runs`) called by Next.js actions.
**BAML (`baml_src/`)**:
*   **Purpose**: Domain-specific language for defining LLM prompts, input/output schemas, and client interfaces. Generates TypeScript and Python client libraries.
*   **Key Definitions**:
    *   **Schemas**: `EstimateLineItem` (now with `uid: uuid4`), `ConstructionProjectData`, `InputFile`. New: `Patch` (for RFC-6902 patches), `PatchEstimateRequest`, `PatchEstimateResponse`, `PatchOperation` enum.
    *   **Clients**: `OpenaiFallback` (for text/estimate generation), `GeminiProcessor` (for audio/video processing).
    *   **Functions**:
        *   `GenerateProjectEstimate(files, existing_estimate?, requested_changes?) -> ConstructionProjectData`: Core estimation logic. Prompt instructs LLM to use provided files/info and output JSON. If `existing_estimate` is provided, UIDs should be reused for unchanged items.
        *   `DetermineNextStep(thread, current_estimate) -> Event`: Chat logic. Decides AI's next action (reply, full update, or patch). Prompt now includes instructions for when to emit `PatchEstimateRequest` (small, ≤5 item tweaks) vs. `UpdateEstimateRequest`.
        *   `ProcessAudio`, `ProcessVideo`: For media file processing.
**LangGraph Workflow (File Processor - `file_processor/graph.py`)**:
*   A `StateGraph` with nodes like `process_files` and `generate_estimate`.
*   `process_files`: Downloads files (via signed URLs), converts images to base64, transcribes audio using `b.ProcessAudio`.
*   `generate_estimate`: Calls `b.GenerateProjectEstimate` with processed files and other inputs.
**Chat Decision Making**: `DetermineNextStep` BAML function is key. If it returns `PatchEstimateRequest`, the Next.js app handles patching directly. If `UpdateEstimateRequest`, Next.js triggers a full LangGraph run.
**Error Handling**: Failures in LangGraph or patching can result in `task_jobs` being marked "failed" or specific error messages in chat.

## Key Considerations for Claude
- **Monorepo Structure**: Differentiate between `apps/web` (Next.js) and `apps/langgraph` (Python AI service).
- **BAML is Central**: AI logic, prompts, and schemas are in `baml_src/`. Run `baml generate` after changes.
- **Server Actions**: Key for Next.js backend operations and Supabase/LangGraph communication.
- **Estimate Updates**: Understand the two paths:
    1.  **Slow Path (Full Re-estimate)**: Triggered by `UpdateEstimateRequest`. Involves a full LangGraph run.
    2.  **Fast Path (Patching)**: Triggered by `PatchEstimateRequest`. Patches applied server-side in Next.js (`applyPatchAndPersist`) for sub-3-second updates. Fallback to slow path if needed.
- **UIDs**: `EstimateLineItem.uid` is essential for the stability of the patching mechanism.
- **Event Types**: Be aware of the new BAML event types: `PatchEstimateRequest` and `PatchEstimateResponse`.
