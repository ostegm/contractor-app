"""File processor for understanding a project from a set of files."""

# Standard library imports
import asyncio
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

def _process_pdf_to_image_input_files_sync(
    pdf_bytes: bytes, 
    original_file_name: str, 
    original_file_description: str | None
) -> list[InputFile]:
    """
    Synchronously converts PDF bytes to a list of image InputFile objects.
    This function contains blocking calls and is intended to be run in a thread.
    """
    logger.info(f"Starting synchronous PDF to image conversion for {original_file_name}")
    page_input_files: list[InputFile] = []
    try:
        pil_images = convert_from_bytes(pdf_bytes, dpi=150)
    except Exception as conversion_error:
        logger.error(f"PDF to image conversion (convert_from_bytes) failed for {original_file_name}: {conversion_error}")
        raise

    if not pil_images:
        logger.warning(f"PDF file {original_file_name} resulted in no images after conversion.")
        raise Exception(f"PDF file {original_file_name} converted to zero pages/images.")

    for i, pil_page_image in enumerate(pil_images):
        page_num = i + 1
        base_name, _ = os.path.splitext(original_file_name)
        safe_base_name = "".join(c if c.isalnum() or c in (' ', '.', '_') else '_' for c in base_name).rstrip()
        page_file_name = f"{safe_base_name}_page_{page_num}.png"
        
        page_description_text = f"Page {page_num} of PDF document: {original_file_description or original_file_name}"
        
        img_byte_arr = io.BytesIO()
        try:
            pil_page_image.save(img_byte_arr, format='PNG')
        except Exception as save_error:
            logger.error(f"Failed to save page {page_num} of PDF {original_file_name} to BytesIO: {save_error}")
            raise

        image_page_bytes = img_byte_arr.getvalue()
        
        if not image_page_bytes:
            logger.warning(f"Page {page_num} of PDF {original_file_name} resulted in empty bytes after save. This page will be skipped.")
            continue 

        image_page_b64 = base64.b64encode(image_page_bytes).decode('utf-8')
        
        page_as_input_file = InputFile(
            name=page_file_name,
            type="image/png", 
            description=page_description_text,
            image_data=Image.from_base64(media_type="image/png", base64=image_page_b64)
        )
        page_input_files.append(page_as_input_file)
    
    logger.info(f"Successfully converted PDF {original_file_name} ({len(pil_images)} pages) to {len(page_input_files)} image InputFiles synchronously.")
    return page_input_files

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


async def process_files(state: State) -> Dict[str, Any]:
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
                
                try:
                    # Call the synchronous helper function in a separate thread
                    page_image_files = await asyncio.to_thread(
                        _process_pdf_to_image_input_files_sync,
                        pdf_bytes,
                        file.name, # pass original name
                        file.description # pass original description
                    )
                    processed_files_for_baml.extend(page_image_files)
                except Exception as pdf_processing_error:
                    logger.error(f"Overall PDF processing in thread failed for {file.name}: {pdf_processing_error}")
                    raise # Propagate error

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







