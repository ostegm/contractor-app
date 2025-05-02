"""File processor for understanding a project from a set of files."""

# Standard library imports
import base64
import logging
from typing import Any, Dict

# Third-party imports
import aiohttp
from .baml_client import b
from .baml_client.types import ConstructionProjectData, InputFile
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph
from baml_py import Image
# Local application imports
from file_processor.state import Configuration, State

# Set up logging
logger = logging.getLogger(__name__)


async def download_from_url(url: str) -> str:
    """Download content from a URL and encode it as base64 if it's binary.
    
    Args:
        url: The URL to download content from.
        
    Returns:
        The content as a string. For binary content, it will be base64-encoded.
        
    Raises:
        Exception: If there's an error downloading the content.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"Failed to download from URL: {response.status}")
                
                # Check content type to determine if it's binary
                content_type = response.headers.get('Content-Type', '')
                
                if content_type.startswith(('image/', 'video/', 'audio/')):
                    # For binary content, read as bytes and encode as base64
                    content = await response.read()
                    return base64.b64encode(content).decode('utf-8')
                else:
                    # For text content, return as is
                    return await response.text()
    except Exception as e:
        logger.error(f"Error downloading from URL {url}: {str(e)}")
        raise


async def process_files(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Process the files using BAML and update the project information."""
    logger.info("Processing files using BAML...")
    file: InputFile
    for file in state.files:
        logger.info(f"Checking if we need to download content for file: {file.name}")
        # If the file has a URL but no content, download the content
        if file.download_url and not file.content:
            try:
                logger.info(f"Downloading content from URL for file: {file.name}")
                file.content = await download_from_url(file.download_url)
                logger.info(f"Successfully downloaded content for file: {file.name}")
            except Exception as e:
                error_msg = f"Failed to download content for file {file.name}: {str(e)}"
                logger.error(error_msg)
                # Raise the exception instead of continuing
                raise Exception(error_msg)
        if file.type == "image":
            file.image_data = Image.from_base64("image/png", file.content)
            logger.info(f"Successfully created image data for file: {file.name} with length {len(file.image_data.as_base64())}")
            file.content = None
        # TODO Add audio and video processing.

    # Call BAML function
    try:
        logger.info("Making BAML call to ProcessProjectFiles...")
        # collector = Collector(name="my-collector")
        updated_project_info = await b.ProcessProjectFiles(
            project_info=state.project_info,
            files=state.files,
            # baml_options={"collector": collector}
        )
        logger.info("Successfully processed files using BAML.")
        return {"updated_project_info": updated_project_info}
    except Exception as e:
        # logging.info(collector.last.calls[0])
        error_msg = f"BAML ProcessProjectFiles failed: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)


async def generate_estimate(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Generate a structured construction estimate using BAML."""
    logger.info("Generating construction estimate using BAML...")
    # TODO: Consider how to use config to dynamically set model/params.
    # https://docs.boundaryml.com/ref/baml_client/client-registry
    _ = Configuration.from_runnable_config(config)
    try:
        logger.info("Making BAML call to GenerateProjectEstimate...")
        response: ConstructionProjectData = await b.GenerateProjectEstimate(
            project_assessment=state.updated_project_info
        )
        logger.info("Successfully generated construction estimate using BAML.")
        # BAML function already returns the structured data
        return {"ai_estimate": response}
    except Exception as e:

        error_msg = f"BAML GenerateProjectEstimate failed: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)


# Define a new graph
workflow = StateGraph(State, config_schema=Configuration)

workflow.add_node("process_files", process_files)
workflow.add_node("generate_estimate", generate_estimate)

workflow.add_edge("__start__", "process_files")
workflow.add_edge("process_files", "generate_estimate")
workflow.set_finish_point("generate_estimate")

# Compile the workflow into an executable graph
graph = workflow.compile()
graph.name = "Construction Project Estimate Assistant"
