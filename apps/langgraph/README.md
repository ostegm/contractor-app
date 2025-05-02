# Contractor File Processing Agent

This langgraph agent is used to process files provided by a contractor to help understand a job they are working on. The goal is to allow the user to input videos, text, pictures or voice recordings along with the current project information and update the project as needed. 

## Overview

The agent takes the following inputs:
- A text string (in markdown format) containing the current project information
- One or more new files (text, images, videos, or voice recordings)

The agent processes these inputs and produces:
- An updated markdown text string describing the project with all the new information incorporated

## Implementation Details

The agent uses a simple workflow:
1. Takes in the current project information and files
2. Processes the files to extract relevant information
3. Uses a language model to update the project information based on the new files
4. Returns the updated project information & an estimate in json format.

### File Processing

The agent can handle different types of files:
- **Text files**: The content is directly used for analysis
- **Images**: The content can be provided as base64-encoded strings, URLs, or Supabase signed URLs along with descriptions
- **Videos**: The agent uses descriptions or analysis of the media
- **Voice recordings**: Transcriptions or descriptions can be processed

### API

See state.py for the API - the File class defines expected input fields. 
File data can be sent as base64Encoded data or a URL. See below for supabase urls.

### Using Supabase Signed URLs

The agent supports downloading files from Supabase signed URLs. Instead of providing the file content directly, you can provide a URL to the file. The agent will automatically download the file content from the URL before processing.

Example:

```python
bathroom_image = File(
    type="image",
    name="current_bathroom.png",
    url="https://your-supabase-instance.supabase.co/storage/v1/object/sign/...",
    description="Image shows a dated bathroom with beige tile..."
)
```

See the `examples/run_file_processor_with_url.py` script for a complete example.

## Models

- Uses Gemini Flash Thinking for efficient processing and reasoning
- Gpt-4o for structured estimate output. 

## Prompts

See `src/file_processor/configuration.py`

## Setup and Installation

### Environment Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd file-processor
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the project in development mode:
   ```bash
   # This installs the project and its dependencies from pyproject.toml
   pip install -e .
   ```

   This will install all dependencies defined in the `pyproject.toml` file.


5. Set up environment variables:
   - Copy the `.env.example` file to `.env`
   - Set relevant API keys.

## Running the Agent

### Using the graph directly in python

We've included an example script that demonstrates how to use the file processor agent:

```bash
# Make sure your virtual environment is activated
python examples/run_file_processor.py
```

This script:
- Loads environment variables from your `.env` file
- Loads an actual bathroom image from the test data
- Creates a sample project with text and image files
- Processes the files and updates the project information
- Prints the updated project information

You can modify the script to use your own project information and files.

### Using the graph via API 




1. Bring up the agent's api:
   ```bash
   uvx --refresh --from "langgraph-cli[inmem]" --with-editable . --python 3.12 langgraph dev --host 0.0.0.0 --port 59432
   ```

2. The server will be available at `http://localhost:59432` (or whatever port you specified)

3. Run one of the javascript examples in the `examples`dir. See the readme there for details.

## Running Tests

### Unit Tests

Run the unit tests with:

```bash
pytest tests/unit_tests
```

### Integration Tests (actual LLM calls)

Run the integration tests with:

```bash
pytest tests/integration_tests
```
