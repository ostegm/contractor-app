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
        try:
            os.remove(path)
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

async def run_analyze_video_baml(video_file: GeminiFile) -> VideoAnalysis:
    """Calls the BAML AnalyzeVideo function with the Gemini video URI."""
    logger.info(f"Requesting video analysis from BAML for {video_file.uri}...")
    req = await b.request.AnalyzeVideo()
    body = req.body.json()
    res = await GENAI_CLIENT.aio.models.generate_content(
        model="gemini-2.5-flash-preview-04-17",
        contents=[
            video_file,
            body["contents"][0]
        ],
    )
    # Parse the LLM response.
    analysis = b.parse.AnalyzeVideo(res.text)
    await delete_file(video_file)
    logger.info("Received analysis from BAML.")
    breakpoint()
    return analysis

async def download_file(url: str, destination: Path) -> None:
    """Downloads a file from a URL to a local destination."""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()  # Raise an exception for HTTP errors
            async with aiofiles.open(destination, "wb") as f:
                await f.write(await response.read())
    logger.info(f"Downloaded {url} to {destination}")

# --- Graph Nodes ---

async def analyze_video_node(state: VideoState) -> Dict[str, Any]:
    """Downloads the video, uploads to Gemini Files API, and calls BAML for analysis."""
    logger.info("--- Running analyze_video_node ---")
    if not state.video_file.download_url:
        await _cleanup_temp_file(state.local_video_path)
        raise ValueError("Video file download_url is missing.")

    local_video_path = TEMP_DIR / f"{uuid.uuid4()}_{state.video_file.name}"
    
    try:
        await download_file(state.video_file.download_url, local_video_path)
        
        uploaded_file = await upload_video_to_gemini(str(local_video_path))
        
        # The BAML function AnalyzeVideo takes the gemini_file_uri (which is video_file.uri from gemini SDK)
        video_analysis_result = await run_analyze_video_baml(uploaded_file)
        
        return {
            "analysis": video_analysis_result,
            "local_video_path": str(local_video_path) # Pass path for next node
        }
    except Exception as e:
        logger.error(f"Error in analyze_video_node: {e}")
        await _cleanup_temp_file(str(local_video_path)) # Cleanup on error
        raise # Re-throw to mark the graph run as failed


async def extract_frames_node(state: VideoState) -> Dict[str, Any]:
    """Extracts key frames using ffmpeg and uploads them to Supabase Storage."""
    logger.info("--- Running extract_frames_node ---")
    if not state.analysis or not state.analysis.key_frames:
        logger.info("No key frames to extract from analysis.")
        await _cleanup_temp_file(state.local_video_path)
        return {"extracted_frames": []}
    
    if not state.local_video_path or not Path(state.local_video_path).exists():
        await _cleanup_temp_file(state.local_video_path) # ensure no partial path lingers
        raise ValueError("Local video path not found or video not downloaded from previous step.")

    if not SUPABASE_URL or not SUPABASE_KEY or not SUPABASE_BUCKET_NAME:
        logger.warning("Supabase environment variables not fully set. Frame upload will be skipped.")
        # Skip upload but prepare InputFile objects with placeholder URLs if desired, or raise error
        await _cleanup_temp_file(state.local_video_path)
        raise ValueError("Supabase configuration missing for frame upload.")

    # Initialize Supabase client within the async function
    supabase: AsyncClient = await create_async_client(SUPABASE_URL, SUPABASE_KEY)

    extracted_frames_input_files: list[InputFile] = []
    
    # Ensure the directory for frames exists for this project_id within temp dir
    project_frames_dir = TEMP_DIR / state.project_id
    project_frames_dir.mkdir(exist_ok=True)

    for key_frame in state.analysis.key_frames:
        frame_filename = key_frame.filename or f"frame_ts_{key_frame.timestamp_s:.2f}.png"
        local_frame_path = project_frames_dir / frame_filename
        
        # Sanitize filename further if needed
        storage_path = f"{state.project_id}/frames/{uuid.uuid4()}_{frame_filename}" # Ensure unique names in storage

        logger.info(f"Extracting frame: {frame_filename} at {key_frame.timestamp_s}s")
        ffmpeg_command = [
            "ffmpeg",
            "-ss", str(key_frame.timestamp_s),
            "-i", state.local_video_path,
            "-vf", "thumbnail", # Optimized for picking best frame around timestamp
            "-vframes", "1",
            "-q:v", "2", # Good quality for JPEGs/PNGs
            str(local_frame_path)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.error(f"Error extracting frame {frame_filename}: {stderr.decode()}")
            # Optionally, continue to next frame or raise error
            continue 
        
        logger.info(f"Frame extracted to {local_frame_path}")

        frame_url_in_supabase = f"error_uploading_{storage_path}" # Default in case of error
        try:
            async with aiofiles.open(local_frame_path, 'rb') as f_frame:
                # Supabase Python client uses synchronous requests, so for async,
                # we use supabase-py-async
                upload_response = await supabase.storage.from_(SUPABASE_BUCKET_NAME).upload(
                    path=storage_path, 
                    file=f_frame, 
                    file_options={"content-type": "image/png", "cache-control": "3600", "upsert": "false"}
                )
            
            if upload_response.status_code == 200:
                # Get public URL
                get_url_response = supabase.storage.from_(SUPABASE_BUCKET_NAME).get_public_url(storage_path)
                frame_url_in_supabase = get_url_response
                logger.info(f"Uploaded {frame_filename} to Supabase. URL: {frame_url_in_supabase}")
            else:
                logger.error(f"Error uploading {frame_filename} to Supabase. Status: {upload_response.status_code}, Response: {await upload_response.json() if upload_response else 'No response'}")
                # Attempt to get error message if it's a known Supabase error structure
                # try:
                #     error_data = await upload_response.json()
                #     print(f"Supabase error details: {error_data.get('message', error_data)}")
                # except Exception:
                #     pass # Ignore if response is not JSON or doesn't have message

        except Exception as e:
            logger.error(f"Exception during Supabase upload for {frame_filename}: {e}")
            # frame_url_in_supabase remains the error placeholder

        extracted_frames_input_files.append(
            InputFile(
                name=frame_filename,
                type="image/png", # Assuming PNG, ffmpeg can output various
                description=key_frame.description,
                download_url=frame_url_in_supabase, # This should be the actual URL from Supabase
                # No content, image_data, or audio_data for these file objects initially
            )
        )
        # Optionally, clean up local_frame_path if no longer needed immediately
        # await _cleanup_temp_file(str(local_frame_path))


    return {"extracted_frames": extracted_frames_input_files}


async def return_results_node(state: VideoState) -> Dict[str, Any]:
    """Prepares the final result structure for the video processing workflow."""
    logger.info("--- Running return_results_node ---")
    
    # Cleanup the downloaded video file
    await _cleanup_temp_file(state.local_video_path)

    if not state.analysis:
        # This case should ideally be handled by graph logic if analysis is critical
        logger.warning("Video analysis is missing in the final state.")
        return {
            "final_output": { # Define a consistent "final_output" key for the graph's result
                "detailed_description": "Error: Video analysis could not be completed.",
                "frames": [],
                "error": "Video analysis missing."
            }
        }

    return {
        "final_output": {
            "detailed_description": state.analysis.detailed_description,
            "frames": state.extracted_frames, # List of InputFile objects
        }
    }


# --- Graph Definition ---
graph_builder = StateGraph(VideoState)

graph_builder.add_node("analyze_video", analyze_video_node)
graph_builder.add_node("extract_frames", extract_frames_node)
graph_builder.add_node("return_results", return_results_node)

graph_builder.set_entry_point("analyze_video")

graph_builder.add_edge("analyze_video", "extract_frames")
graph_builder.add_edge("extract_frames", "return_results")
graph_builder.add_edge("return_results", END) # Explicitly end the graph


# Compile the graph
video_processor_graph = graph_builder.compile()

logger.info("Video processor graph compiled.")