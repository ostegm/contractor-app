# CLAUDE.md - Developer Guide

## Commands
- Development: `npm run dev`
- Lint: `npm run lint`
- Test: `npm run test`

## Architecture
- `/app`: Next.js routes and pages using App Router architecture
- `/components`: Reusable React components
- `/lib`: Utilities and API clients
- `/baml_client`: Generated BAML client for AI communication

## Key Features

### Chat System with AI Estimate Generation
- Interactive chat interface with LLM-based assistant
- Full estimate regeneration when needed (20-30 second operation)
- Fast patch updates via JSON Patch (RFC-6902) for sub-3 second edits
  - Patch events bypass LangGraph and apply changes directly to stored estimates
  - Flash animation highlights only updated fields in the UI
  - Automatic fallback to full regeneration for complex changes

### Data Storage & Processing
- Supabase for authentication and database (PostgreSQL)
- Files uploaded to Supabase Storage with metadata in database
- LangGraph service for AI processing of files and generating estimates
- Video processing for extracting frames and generating summaries

## Code Guidelines
- TypeScript with strict type checking
- React Server Components and Server Actions for data mutations
- Error handling: server actions return `{error?: string, success?: boolean}`
- JSON parsing: Always handle both string and object formats with proper typechecking
- UIDs for line items enable stable JSON patch paths
- CSS animations: Use flash-highlight class for patched field visualization