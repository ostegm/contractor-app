import sys
from pathlib import Path

# Calculate the workspace root.
# The test file is at <workspace_root>/apps/langgraph/tests/unit_tests/test_video_processing_unit.py
# So we need to go up 4 levels from the directory of this file to reach the workspace root.
_test_file_dir = Path(__file__).resolve().parent
_workspace_root = _test_file_dir.parent.parent.parent.parent

# Add workspace root to sys.path to allow 'from apps...' imports
if str(_workspace_root) not in sys.path:
    sys.path.insert(0, str(_workspace_root))

import asyncio
import os
import logging
from pathlib import Path

import pytest
from google.genai.types import File as GeminiFile

# Adjust the import path based on your project structure and how you run pytest
# This assumes pytest is run from the root of the langgraph app or workspace root with apps/langgraph in PYTHONPATH
from apps.langgraph.src.file_processor.video_graph import (
    upload_video_to_gemini,
    run_analyze_video_baml,
)
from apps.langgraph.src.file_processor.baml_client.types import VideoAnalysis
from apps.langgraph.src.file_processor.baml_client import b # Import baml client instance

# --- Set up logger ---
logger = logging.getLogger(__name__)

# --- Configuration for the test ---
# IMPORTANT: This test uses an absolute path. 
# Ensure this video file exists at this location when running the test,
# or change it to a path accessible by your test environment.
LOCAL_VIDEO_PATH_STR = "/Users/otto/Downloads/add_showerhead.mp4"
LOCAL_VIDEO_PATH = Path(LOCAL_VIDEO_PATH_STR)

# Ensure GOOGLE_API_KEY is set in the environment for this test to run
# (pytest-env can be useful for this: set GOOGLE_API_KEY=your_key in pytest.ini or .env file)

@pytest.mark.asyncio
async def test_upload_and_analyze_video_workflow():
    """Tests the video upload and BAML analysis workflow using a local video file."""
    
    if not LOCAL_VIDEO_PATH.is_file():
        pytest.skip(f"Test video file not found at {LOCAL_VIDEO_PATH_STR}. Skipping test.")

    if not os.getenv("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY environment variable not set. Skipping API call test.")

    logger.info(f"Attempting to upload video: {LOCAL_VIDEO_PATH_STR}")
    uploaded_file: GeminiFile | None = None
    try:
        uploaded_file = await upload_video_to_gemini(str(LOCAL_VIDEO_PATH))
    except Exception as e:
        pytest.fail(f"upload_video_to_gemini failed: {e}")

    assert uploaded_file is not None, "Uploaded file object should not be None"
    assert uploaded_file.uri is not None, "Uploaded file URI should not be None"
    assert uploaded_file.name is not None, "Uploaded file name should not be None"
    logger.info(f"Video uploaded successfully: URI {uploaded_file.uri}, Name: {uploaded_file.name}")

    logger.info(f"Attempting to analyze video: {uploaded_file.uri}")
    analysis_result: VideoAnalysis | None = None
    try:
        # Ensure that the run_analyze_video_baml function uses b.parse.AnalyzeVideo
        # if its output type is VideoAnalysis as suggested by the type hint.
        analysis_result = await run_analyze_video_baml(uploaded_file)
    except Exception as e:
        pytest.fail(f"run_analyze_video_baml failed: {e}")

    assert analysis_result is not None, "Analysis result should not be None"
    assert isinstance(analysis_result, VideoAnalysis), f"Expected VideoAnalysis, got {type(analysis_result)}"
    
    logger.info(f"Video analysis successful. Description:\n{analysis_result.detailed_description}")
    assert analysis_result.detailed_description is not None, "Detailed description should be present"
    assert isinstance(analysis_result.key_frames, list), "Key frames should be a list"
    for key_frame in analysis_result.key_frames:
        logger.info(f"Key frame: {key_frame.filename}, {key_frame.timestamp_s}, {key_frame.description}")
