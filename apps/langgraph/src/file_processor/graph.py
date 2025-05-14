"""File processor for understanding a project from a set of files."""

# Standard library imports
import base64
import logging
import os
import io
from typing import Any, Dict, Union

# Third-party imports
import aiohttp
from .baml_client import b
from .baml_client.types import ConstructionProjectData, InputFile
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph
from baml_py import Image, Audio
from pdf2image import convert_from_bytes

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
        try:
            file = InputFile(**file_input_data) if isinstance(file_input_data, dict) else file_input_data
        except TypeError as e:
            logger.error(f"Failed to create InputFile from dict: {file_input_data}. Error: {e}")
            raise ValueError(f"Invalid file data structure: {file_input_data}") from e

        logger.info(f"Processing file: {file.name} (MIME Type: {file.type}) with URL: {file.download_url}")

        if not file.download_url:
            logger.warning(f"Skipping file {file.name} as it has no download_url.")
            raise Exception(f"File {file.name} has no download_url, cannot process.")
        
        try:
            if file.type.startswith("application/pdf"):
                logger.info(f"Processing PDF file {file.name} by converting pages to images.")
                pdf_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="application/pdf")
                
                # Convert PDF bytes to a list of PIL images
                # Using a moderate DPI. Adjust if needed for quality vs. size/performance.
                pil_images = convert_from_bytes(pdf_bytes, dpi=150) 
                
                if not pil_images:
                    logger.warning(f"PDF file {file.name} resulted in no images after conversion.")
                    # Depending on strictness, this could be an error or just an empty PDF.
                    # For now, if no images, we add nothing, effectively skipping content.
                    # User wants an error if PDF processing fails, so an empty PDF might be a failure case.
                    raise Exception(f"PDF file {file.name} converted to zero pages/images.")

                for i, pil_page_image in enumerate(pil_images):
                    page_num = i + 1
                    # Create a more unique name based on original file name, ensuring it's a valid filename
                    base_name, _ = os.path.splitext(file.name)
                    safe_base_name = "".join(c if c.isalnum() or c in (' ', '.', '_') else '_' for c in base_name).rstrip()
                    page_file_name = f"{safe_base_name}_page_{page_num}.png"
                    
                    page_description = f"Page {page_num} of PDF document: {file.description or file.name}"
                    
                    img_byte_arr = io.BytesIO()
                    pil_page_image.save(img_byte_arr, format='PNG') # Save as PNG
                    image_page_bytes = img_byte_arr.getvalue()
                    
                    image_page_b64 = base64.b64encode(image_page_bytes).decode('utf-8')
                    
                    page_as_input_file = InputFile(
                        name=page_file_name,
                        type="image/png", 
                        description=page_description,
                        image_data=Image.from_base64(media_type="image/png", base64=image_page_b64)
                        # download_url is not applicable for these generated images
                    )
                    processed_files_for_baml.append(page_as_input_file)
                logger.info(f"Successfully converted PDF {file.name} ({len(pil_images)} pages) to image InputFiles.")

            elif file.type.startswith("image/"):
                file_baml_img = InputFile(name=file.name, type=file.type, description=file.description, download_url=file.download_url)
                logger.info(f"Downloading image content for {file.name} from {file.download_url}")
                image_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="image/")
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                file_baml_img.image_data = Image.from_base64(media_type=file.type, base64=image_b64)
                processed_files_for_baml.append(file_baml_img)
                logger.info(f"Successfully processed image data for file: {file.name}")
            
            elif file.type.startswith("audio/"):
                file_baml_audio = InputFile(name=file.name, type=file.type, description=file.description, download_url=file.download_url)
                logger.info(f"Downloading audio content for {file.name} from {file.download_url}")
                audio_bytes = await download_from_url(file.download_url, as_bytes=True, expected_mime_type_prefix="audio/")
                audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
                file_baml_audio.audio_data = Audio.from_base64(media_type=file.type, base64=audio_b64)
                logger.info("Calling BAML ProcessAudio for transcription")
                transcription = await b.ProcessAudio(audio=file_baml_audio) # Pass the InputFile with audio_data
                logger.info(f"Transcription result: {transcription[:100]}...") # Log snippet
                file_baml_audio.content = transcription
                file_baml_audio.audio_data = None # Clear audio data after transcription
                file_baml_audio.type = "text/plain" # Update type to reflect text content
                processed_files_for_baml.append(file_baml_audio)
                logger.info(f"Successfully converted audio to text for file: {file.name}")

            elif file.type.startswith("text/"):
                file_baml_text = InputFile(name=file.name, type=file.type, description=file.description, download_url=file.download_url)
                logger.info(f"Downloading text content for {file.name} from {file.download_url}")
                file_baml_text.content = await download_from_url(file.download_url, as_bytes=False, expected_mime_type_prefix="text/")
                processed_files_for_baml.append(file_baml_text)
                logger.info(f"Successfully downloaded text content for file: {file.name}")

            elif file.type.startswith("video/"):
                logger.warning(f"Skipping video file: {file.name}")

            else:
                logger.warning(f"Unsupported MIME type '{file.type}' for file {file.name}. Skipping.")

        except Exception as e:
            # This will catch errors from download_from_url, pdf conversion, or any other processing for this specific file.
            logger.error(f"Failed to process file {file.name} (URL: {file.download_url}): {str(e)}")
            # Re-raise the exception to fail the step, as per user requirement for PDF processing errors.
            # This will also apply to failures in other file types.
            raise

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
        return {"ai_estimate": response}
    except Exception as e:
        error_msg = f"BAML GenerateProjectEstimate failed: {str(e)}"
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







