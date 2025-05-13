# Contractor Monorepo

This monorepo contains both the Next.js UI and LangGraph service for the Contractor project.

## Overview

The repo is structured to enable fast iteration while letting BAML autogenerate two clients:
- TypeScript/React client for the web app: `apps/web/baml_client/`
- Python/Pydantic client for the LangGraph service: `apps/langgraph/baml_client_py/`

## Directory Structure

```
contractor-monorepo/
├─ apps/
│  ├─ web/                # Next.js UI (from contractor-app)
│  └─ langgraph/          # Python LangGraph service (from file-processor)
├─ baml_src/              # BAML schemas for client generation
├─ .github/workflows/     # CI configuration
└─ ... (configuration files)
```

## Getting Started

### Prerequisites

| Tool         | Version     |
|--------------|-------------|
| **Node**     | ≥ 20        |
| **pnpm**     | ≥ 9         |
| **Python**   | 3.10 – 3.11 |
| **Poetry**   | ≥ 1.8       |
| **BAML CLI** | 0.86.1      |

### Setup and Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Generate BAML clients:
   ```bash
   pnpm run dev:baml
   ```

3. Start development servers:
   ```bash
   pnpm run dev
   ```

## Available Scripts

- `pnpm run dev` - Start both Next.js UI and LangGraph servers
- `pnpm run dev:ui` - Start only the Next.js UI server
- `pnpm run dev:langgraph` - Start only the LangGraph server
- `pnpm run dev:baml` - Generate BAML clients in watch mode
- `pnpm run dev:all` - Start all services (BAML, UI, LangGraph)
- `pnpm run lint` - Run ESLint checks
- `pnpm run test` - Run JavaScript tests with Vitest
- `pnpm run test:python` - Run Python tests with pytest
- `pnpm run build` - Build all packages

## Testing

- Web UI: `pnpm --filter @contractor/web test`
- Python service: `cd apps/langgraph && poetry run pytest`




## TODOS
- Export to CSV
- Handle Video input - process into text file and images
- Need to import into quickbooks (see chat gpt)
- Review export/import functionality chatgpt - maybe add to app?
- Mobile UX?
- Auto name chats async after 2 messages (baml impl with 4.1nano)
- Manual edit mode (clicking an item to edit)
- Allow recording audio note in UI.
- Cleanup polling (i think its happening due to chat thread polling)
- Build test case for yard project
   - Plans from yard designer
   - Web search for Pricing per plant
   - How many grasses of type x are there in this project?
- How to enable web search (firecrawl?) 
- How to make it faster (only produce sections of the aiestimate? Don't regenerate all of it)
- Test cases from Lily
- Test case from forrest
- Revision history on estimate (with comparison notes from small model)
- Schedule a Landscaper call for feedback
- Deploy to vercel/langgraph/supabase
