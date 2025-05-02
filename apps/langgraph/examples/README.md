# File Processor API Examples

This directory contains examples of how to call the file processor agent using both Python and JavaScript.

## Python Example

The `run_file_processor.py` script demonstrates how to use the file processor agent directly in Python.

To run the Python example:

```bash
# Make sure you're in the project root directory
python examples/run_file_processor.py
```

## JavaScript Examples

The JavaScript examples demonstrate how to call the file processor agent using the REST API.

### Prerequisites

- Node.js 14 or higher
- npm (Node Package Manager)

### Installation

```bash
# Navigate to the examples directory
cd examples

# Install dependencies
npm install
```

### Running the Examples

All JavaScript examples accept an optional port number as a command line argument. If not provided, they default to port 59342.

```bash
# Run with default port (59342)
node run_file_processor_api.js

# Run with a specific port
node run_file_processor_api.js 8000
```

### API Server

All JavaScript examples assume that the LangGraph API server is running on `http://localhost:59342` by default. You can specify a different port as a command line argument when running the scripts.

## API Endpoints Used

The examples use the following endpoints from the LangGraph API:

### Stateless Endpoints
- `/runs/wait` - Create a run in a new thread and wait for the final output
- `/runs/stream` - Create a run in a new thread and stream the output in real-time

### Stateful Endpoints
- `/assistants` - Create a new assistant
- `/assistants/search` - Search for existing assistants
- `/threads` - Create a new thread
- `/threads/{thread_id}/runs/wait` - Create a run in an existing thread and wait for the final output
- `/threads/{thread_id}/runs/stream` - Create a run in an existing thread and stream the output in real-time
- `/threads/{thread_id}/state` - Get the current state of a thread

For more details on the available endpoints, refer to the OpenAPI schema in the project root directory. 