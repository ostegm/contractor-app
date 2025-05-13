from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Any, Dict

import aiofiles
import aiohttp
from google import genai
from google.genai.types import File as GeminiFile
from supabase import create_async_client, AsyncClient


from langgraph.graph import StateGraph, END

from .baml_client import b
from .baml_client.types import InputFile, VideoAnalysis, KeyFrame
from .state import VideoState

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO) # Basic config, can be more sophisticated

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable not set.")


GENAI_CLIENT = genai.Client(api_key=GOOGLE_API_KEY)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_BUCKET_NAME = os.environ.get("SUPABASE_STORAGE_BUCKET")

# --- Temp directory for downloads and frame extractions ---
TEMP_DIR = Path(__file__).parent / "tmp_video_processing"
TEMP_DIR.mkdir(exist_ok=True)

async def _cleanup_temp_file(path: Optional[str]):
    if path and Path(path).exists():
        def safe_remove(p):
            try:
                os.remove(p)
            except FileNotFoundError:
                pass
        try:
            await asyncio.to_thread(safe_remove, path)
            logger.info(f"Cleaned up temporary file: {path}")
        except Exception as e:
            logger.error(f"Error cleaning up temporary file {path}: {e}")


async def upload_video_to_gemini(local_path: str) -> GeminiFile:
    """Uploads a local video file to Gemini Files API and returns its URI."""
    if not GOOGLE_API_KEY:
        raise ValueError("Google API Key not configured.")
    
    logger.info(f"Uploading {local_path} to Gemini Files API.")
    # async with aiofiles.open(local_path, "rb") as f:
    video_file: GeminiFile = await GENAI_CLIENT.aio.files.upload(file=local_path)
    while not video_file.state or video_file.state.name != "ACTIVE":
        logger.info(f"Polling video state: {video_file.state.name if video_file.state else 'Unknown'}")
        await asyncio.sleep(5)
        video_file = await GENAI_CLIENT.aio.files.get(name=video_file.name) # Ensure client has .aio for async

    logger.info(f"Uploaded to Gemini: {video_file.uri} (Name: {video_file.name})")
    return video_file

async def delete_file(file: GeminiFile) -> None:
    """Deletes a file from Gemini Files API."""
    await GENAI_CLIENT.aio.files.delete(name=file.name)
    logger.info(f"Deleted file: {file.name}")

async def run_analyze_video_baml(uploaded_video_file: GeminiFile, video_name: str, video_description: str) -> VideoAnalysis:
    """Calls the BAML AnalyzeVideo function with the Gemini video URI."""
    logger.info(f"Requesting video analysis from BAML for {uploaded_video_file.uri}...")
    req = await b.request.AnalyzeVideo(video_name=video_name, video_description=video_description)
    body = req.body.json()
    res = await GENAI_CLIENT.aio.models.generate_content(
        model="gemini-2.5-flash-preview-04-17",
        contents=[
            uploaded_video_file,
            body["contents"][0]
        ],
    )
    # Parse the LLM response.
    analysis = b.parse.AnalyzeVideo(res.text)
    await delete_file(uploaded_video_file)
    logger.info("Received analysis from BAML.")
    return analysis

async def download_file(url: str, destination: Path) -> None:
    """Downloads a file from a URL to a local destination."""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()  # Raise an exception for HTTP errors
            async with aiofiles.open(destination, "wb") as f:
                await f.write(await response.read())
    logger.info(f"Downloaded {url} to {destination}")


async def _extract_key_frames_locally(
    local_video_path: str, 
    key_frames: list[KeyFrame], 
    project_id: str, # project_id is not used anymore for directory creation but kept for consistency
    base_temp_dir: Path # base_temp_dir is not used anymore
) -> list[tuple[KeyFrame, bytes, str]]: # Returns KeyFrame, image_bytes, filename
    """
    Extracts key frames from the video file using ffmpeg and returns them as bytes.

    Args:
        local_video_path: Path to the local video file.
        key_frames: List of KeyFrame objects specifying which frames to extract.
        project_id: The project ID (currently unused in this in-memory version).
        base_temp_dir: The base temporary directory (currently unused).

    Returns:
        A list of tuples, where each tuple contains the KeyFrame object, 
        the image data as bytes, and the generated filename.
    """
    if not key_frames:
        logger.info("No key frames provided for in-memory extraction.")
        return []

    extracted_frames_data: list[tuple[KeyFrame, bytes, str]] = []

    for key_frame in key_frames:
        # Generate a filename, still useful for Supabase path and InputFile name
        frame_filename = key_frame.filename or f"frame_ts_{key_frame.timestamp_s:.2f}.png"
        
        logger.info(f"Extracting frame in-memory: {frame_filename} at {key_frame.timestamp_s}s")
        ffmpeg_command = [
            "ffmpeg",
            "-ss", str(key_frame.timestamp_s),
            "-i", local_video_path,
            "-vf", "thumbnail", 
            "-vframes", "1",
            "-f", "image2pipe", # Output format is image2pipe
            "-c:v", "png", # Codec is png
            "pipe:1" # Output to stdout
        ]
        
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.error(f"Error extracting frame {frame_filename} in-memory: {stderr.decode()}")
            # Optionally, continue to next frame or raise error; here we continue
            continue 
        
        if not stdout:
            logger.warning(f"No stdout data received for frame {frame_filename} during in-memory extraction.")
            continue

        logger.info(f"Frame {frame_filename} extracted in-memory ({len(stdout)} bytes).")
        extracted_frames_data.append((key_frame, stdout, frame_filename))
    
    return extracted_frames_data



# --- Graph Nodes ---

async def analyze_video_node(state: VideoState) -> Dict[str, Any]:
    """Downloads the video, uploads to Gemini Files API, and calls BAML for analysis."""
    logger.info("--- Running analyze_video_node ---")
    state.video_file = InputFile(**state.video_file)
    if not state.video_file.download_url:
        await _cleanup_temp_file(state.local_video_path)
        raise ValueError("Video file download_url is missing.")

    local_video_path = TEMP_DIR / f"{uuid.uuid4()}_{state.video_file.name}"
    
    try:
        await download_file(state.video_file.download_url, local_video_path)
        
        uploaded_file = await upload_video_to_gemini(str(local_video_path))
        
        # The BAML function AnalyzeVideo takes the gemini_file_uri (which is video_file.uri from gemini SDK)
        video_analysis_result = await run_analyze_video_baml(
            uploaded_file, state.video_file.name, state.video_file.description)
        
        return {
            "analysis": video_analysis_result,
            "local_video_path": str(local_video_path) # Pass path for next node
        }
    except Exception as e:
        logger.error(f"Error in analyze_video_node: {e}")
        await _cleanup_temp_file(str(local_video_path)) # Cleanup on error
        raise # Re-throw to mark the graph run as failed


async def extract_frames_node(state: VideoState) -> Dict[str, Any]:
    """Extracts key frames using ffmpeg, uploads them as bytes to Supabase Storage."""
    logger.info("--- Running extract_frames_node ---")
    if not state.analysis or not state.analysis.key_frames:
        logger.info("No key frames to extract from analysis.")
        await _cleanup_temp_file(state.local_video_path) # Cleanup video if no frames to extract
        return {"extracted_frames": []}
    
    if not state.local_video_path or not Path(state.local_video_path).exists():
        # No cleanup for state.local_video_path as it might not exist or be valid.
        raise ValueError("Local video path not found or video not downloaded from previous step.")

    if not SUPABASE_URL or not SUPABASE_KEY or not SUPABASE_BUCKET_NAME:
        logger.warning("Supabase environment variables not fully set. Frame upload will be skipped.")
        await _cleanup_temp_file(state.local_video_path) # Cleanup video if skipping uploads
        # To maintain consistency, we could return InputFile objects with placeholder/error URLs
        # For now, raising an error as this is a critical step if reached.
        raise ValueError("Supabase configuration missing for frame upload.")

    # Initialize Supabase client within the async function
    supabase: AsyncClient = await create_async_client(SUPABASE_URL, SUPABASE_KEY)
    
    extracted_frames_input_files: list[InputFile] = []

    # Step 1: Extract frames in-memory
    try:
        in_memory_extracted_frames = await _extract_key_frames_locally(
            local_video_path=state.local_video_path,
            key_frames=state.analysis.key_frames,
            project_id=state.project_id, # Pass along, though not used for path creation now
            base_temp_dir=TEMP_DIR # Pass along, though not used for path creation now
        )
    except Exception as e:
        logger.error(f"Error during in-memory frame extraction: {e}")
        await _cleanup_temp_file(state.local_video_path) # Cleanup video on extraction error
        raise # Re-throw to mark graph run as failed

    # Step 2: Upload in-memory extracted frames to Supabase
    for key_frame, frame_bytes, frame_filename in in_memory_extracted_frames:
        # storage_path needs to be unique and well-formed.
        # Using the generated filename.
        # Prepending with UUID to ensure uniqueness in Supabase.
        storage_path = f"{state.project_id}/frames/{state.parent_file_id}/{frame_filename}"
        try:
            # Upload bytes directly
            upload_response = await supabase.storage.from_(SUPABASE_BUCKET_NAME).upload(
                path=storage_path, 
                file=frame_bytes, # Pass bytes directly
                file_options={"content-type": "image/png", "cache-control": "3600", "upsert": "false"}
            )
            logger.info(f"Uploaded {frame_filename} to Supabase. URL: {storage_path}: {upload_response}")

        except Exception as e:
            logger.error(f"Exception during Supabase upload for {frame_filename}: {e}")
            await _cleanup_temp_file(state.local_video_path)
            raise
        
        extracted_frames_input_files.append(
            InputFile(
                name=frame_filename, # Use the generated filename
                type="image/png", 
                description=key_frame.description,
                download_url=storage_path, # Put storage path in download url so we can put it in the files table.
            )
        )
        # No local frame file to clean up with _cleanup_temp_file for this frame
    
    # If all in-memory frames were processed (uploaded or failed individually), 
    # the main local video path cleanup is handled by the return_results_node.
    await _cleanup_temp_file(state.local_video_path)
    return {"extracted_frames": extracted_frames_input_files}





# --- Graph Definition ---
graph_builder = StateGraph(VideoState)

graph_builder.add_node("analyze_video", analyze_video_node)
graph_builder.add_node("extract_frames", extract_frames_node)

graph_builder.set_entry_point("analyze_video")

graph_builder.add_edge("analyze_video", "extract_frames")
graph_builder.add_edge("extract_frames", END)


# Compile the graph
video_processor_graph = graph_builder.compile()

logger.info("Video processor graph compiled.")