# TypeScript API Examples with BAML Types

This directory contains TypeScript examples of how to call the file processor agent using the REST API, leveraging the BAML-generated types.

## Key Benefits

- **Type Safety**: Uses the same types as the LangGraph application
- **Consistency**: Types are automatically updated when BAML definitions change
- **Better Developer Experience**: Type hints and validation in IDEs

## Prerequisites

- Node.js 14 or higher
- npm (Node Package Manager)
- TypeScript

## Installation

```bash
# Navigate to the examples directory
cd apps/web/examples/api

# Install dependencies
npm install
```

## Running the Examples

```bash
# Run with default port (59342)
npx ts-node run_file_processor_api.ts

# Run with a specific port
npx ts-node run_file_processor_api.ts 8000
```

## BAML Types Used

The examples use the following types from the BAML client:

- `InputFile`: Represents a file to be processed
- `ConstructionProjectData`: Represents the AI-generated construction estimate
- `EstimateLineItem`: Represents a line item in the construction estimate

These types are imported from `../../baml_client/baml_client/types`, ensuring that the TypeScript examples use the same types as the LangGraph application.

## Moving JavaScript Examples

The original JavaScript examples are still available in the LangGraph app (`apps/langgraph/src/file_processor/examples/`). For maintainability, consider:

1. Using these TypeScript examples as the primary examples
2. Updating the LangGraph examples to point to these TypeScript examples
3. Eventually phasing out the JavaScript examples in favor of TypeScript ones

## API Server

All examples assume that the LangGraph API server is running on `http://localhost:59342` by default. You can specify a different port as a command line argument when running the scripts.