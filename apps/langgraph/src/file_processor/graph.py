"""File processor for understanding a project from a set of files."""

# Standard library imports
import base64
import logging
import os
from typing import Any, Dict, Union

# Third-party imports
import aiohttp
from .baml_client import b
from .baml_client.types import ConstructionProjectData, InputFile, ProcessedVideo
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph
from baml_py import Image, Audio # Assuming Audio is available from baml_py
# Local application imports
from .state import Configuration, State

# Set up logging
logger = logging.getLogger(__name__)


async def download_from_url(url: str, as_bytes: bool = False, expected_mime_type_prefix: str | None = None) -> Union[str, bytes]:
    """Download content from a URL.
    
    Args:
        url: The URL to download content from.
        as_bytes: If True, returns content as bytes. Otherwise, decodes as UTF-8 string.
        expected_mime_type_prefix: Optional. If provided, checks if the response Content-Type starts with this prefix.
        
    Returns:
        The content as a string or bytes.
        
    Raises:
        Exception: If there's an error downloading or if MIME type mismatch.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"Failed to download from URL {url}: {response.status} {await response.text()}")
                
                content_type = response.headers.get('Content-Type', '')
                logger.info(f"Downloaded from {url}, content-type: {content_type}")

                if expected_mime_type_prefix and not content_type.startswith(expected_mime_type_prefix):
                    logger.warning(f"MIME type mismatch for {url}. Expected prefix: {expected_mime_type_prefix}, Got: {content_type}")
                    # Depending on strictness, you might raise an exception here
                    # For now, we'll proceed but log a warning.

                content = await response.read()
                if as_bytes:
                    return content
                else:
                    # Attempt to decode as UTF-8, handle potential errors
                    try:
                        return content.decode('utf-8')
                    except UnicodeDecodeError:
                        logger.warning(f"Failed to decode content from {url} as UTF-8. Returning as base64 string.")
                        return base64.b64encode(content).decode('utf-8') # Fallback for non-text if as_bytes=False
    except Exception as e:
        logger.error(f"Error downloading from URL {url}: {str(e)}")
        raise


async def process_files(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Process the files by downloading content from URLs and preparing for BAML."""
    logger.info("Processing files by downloading content from URLs...")
    processed_files_for_baml: list[InputFile] = []

    for file_input_data in state.files:
        # Ensure file_data is an InputFile instance or can be converted
        # The input from actions.ts is a list of dicts matching FileToProcess,
        # which should map to InputFile fields.
        try:
            # file.type is now the MIME type from actions.ts
            # file.download_url is the Supabase signed URL
            file = InputFile(**file_input_data) if isinstance(file_input_data, dict) else file_input_data
        except TypeError as e:
            logger.error(f"Failed to create InputFile from dict: {file_input_data}. Error: {e}")
            raise ValueError(f"Invalid file data structure: {file_input_data}") from e

        logger.info(f"Processing file: {file.name} (MIME Type: {file.type}) with URL: {file.download_url}")

        if not file.download_url:
            logger.warning(f"Skipping file {file.name} as it has no download_url.")
            # Optionally, add to a list of skipped/failed files in the state
            raise Exception(f"File {file.name} has no download_url.")
        
        file_baml = InputFile(name=file.name, type=file.type, description=file.description, download_url=file.download_url)

        try:
            if file.type.startswith("image/"):
                logger.info(f"Downloading image content for {file.name} from {file.download_url}")
                image_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="image/")
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                file_baml.image_data = Image.from_base64(media_type=file.type, base64=image_b64)
                logger.info(f"Successfully processed image data for file: {file.name}")
            
            elif file.type.startswith("audio/"):
                logger.info(f"Downloading audio content for {file.name} from {file.download_url}")
                audio_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="audio/")
                audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
                file_baml.audio_data = Audio.from_base64(media_type=file.type, base64=audio_b64)
                logger.info("Calling gemini for transcription")
                transcription = await b.ProcessAudio(audio=file_baml)
                logger.info(f"Transcription: {transcription}")
                file_baml.content = transcription
                file_baml.audio_data = None
                file_baml.type = "text/plain"
                logger.info(f"Successfully converted audio to text for file: {file.name}")

            elif file.type.startswith("text/"):
                logger.info(f"Downloading text content for {file.name} from {file.download_url}")
                file_baml.content = await download_from_url(file.download_url, as_bytes=False, expected_mime_type_prefix="text/")
                logger.info(f"Successfully downloaded text content for file: {file.name}")

            elif file.type.startswith("video/"):
                # For videos, we'll download the content.
                # The actual upload to Gemini Files API will be handled by a dedicated video processing logic/node later.
                logger.info(f"Downloading video content for {file.name} from {file.download_url}")
                video_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="video/")
                file_baml.content = base64.b64encode(video_bytes).decode('utf-8') # Temporary storage for video bytes
                logger.info(f"Successfully downloaded video content (as base64) for file: {file.name}")

            else:
                logger.warning(f"Unsupported MIME type '{file.type}' for file {file.name}. Downloading as text content.")
                # Default to downloading as text, or handle as raw bytes if more appropriate
                file_baml.content = await download_from_url(file.download_url, as_bytes=False)

            processed_files_for_baml.append(file_baml)

        except Exception as e:
            logger.error(f"Failed to process file {file.name} (URL: {file.download_url}): {str(e)}")
            # Optionally, add to a list of failed files in the state or raise
            # For now, we skip adding it to processed_files_for_baml if processing fails

    return {"files": processed_files_for_baml}


async def generate_estimate(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Generate a structured construction estimate using BAML."""
    logger.info("Generating construction estimate using BAML...")
    # TODO: Consider how to use config to dynamically set model/params.
    # https://docs.boundaryml.com/ref/baml_client/client-registry
    _ = Configuration.from_runnable_config(config)
    try:
        logger.info("Making BAML call to GenerateProjectEstimate...")
        response: ConstructionProjectData = await b.GenerateProjectEstimate(
            files=state.files,
            existing_estimate=state.ai_estimate,
            requested_changes=state.requested_changes
        )
        logger.info("Successfully generated construction estimate using BAML.")
        # BAML function already returns the structured data
        return {"ai_estimate": response}
    except Exception as e:

        error_msg = f"BAML GenerateProjectEstimate failed: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)


async def process_video(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Process the video using BAML and update the project information."""
    logger.info("Processing video using BAML...")
    _ = Configuration.from_runnable_config(config)
    try:
        logger.info("Making BAML call to ProcessVideo...")
        response: ProcessedVideo = await b.ProcessVideo(video=state.video)
        logger.info("Successfully processed video using BAML.")
        return {"video_summary": response}
    except Exception as e:
        error_msg = f"BAML ProcessVideo failed: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)





def build_estimate_workflow():
    """Builds the workflow for generating a construction estimate."""
    workflow = StateGraph(State, config_schema=Configuration)

    workflow.add_node("process_files", process_files)
    workflow.add_node("generate_estimate", generate_estimate)

    workflow.add_edge("__start__", "process_files")
    workflow.add_edge("process_files", "generate_estimate")
    workflow.set_finish_point("generate_estimate")
    return workflow

# Compile the workflow into an executable graph
estimate_graph = build_estimate_workflow().compile()
estimate_graph.name = "Construction Project Estimate Assistant"







