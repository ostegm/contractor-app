
"""Tests for the video processing workflow.

uv run pytest tests/unit_tests/test_video_processing_unit.py -v --log-cli-level=INFO

uv run pytest tests/unit_tests/test_video_processing_unit.py::test_extract_key_frames_locally -v --log-cli-level=INFO
"""

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
import uuid

import pytest
from google.genai.types import File as GeminiFile

# Adjust the import path based on your project structure and how you run pytest
# This assumes pytest is run from the root of the langgraph app or workspace root with apps/langgraph in PYTHONPATH
from apps.langgraph.src.file_processor.video_graph import (
    upload_video_to_gemini,
    run_analyze_video_baml,
    _extract_key_frames_locally,
    TEMP_DIR,
)
from apps.langgraph.src.file_processor.baml_client.types import VideoAnalysis, KeyFrame
from apps.langgraph.src.file_processor.baml_client import b # Import baml client instance

# --- Set up logger ---
logger = logging.getLogger(__name__)

# --- Configuration for the test ---
# IMPORTANT: This test uses an absolute path. 
# Ensure this video file exists at this location when running the test,
# or change it to a path accessible by your test environment.
LOCAL_VIDEO_PATH_STR = "/Users/otto/Downloads/add_showerhead.mp4"
LOCAL_VIDEO_PATH = Path(LOCAL_VIDEO_PATH_STR)


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

@pytest.mark.asyncio
async def test_extract_key_frames_locally():
    """Tests the _extract_key_frames_locally function for extracting frames to local disk."""
    if not LOCAL_VIDEO_PATH.is_file():
        pytest.skip(f"Test video file not found at {LOCAL_VIDEO_PATH_STR}. Skipping test.")

    # Use a unique project_id for this test run to avoid conflicts if run in parallel
    # or if previous test runs didn't clean up properly.
    test_project_id = f"test_project_{uuid.uuid4()}"
    
    # Define mock KeyFrame data based on user logs
    mock_key_frames_data = [
        {"filename": "frame_01.png", "timestamp_s": 0.0, "description": "View of the bathroom from the left, showing wooden vanity cabinets with black handles and the edge of a mirror reflecting the person recording.\"\n    For estimating, this shows the vanity style and general bathroom context."},
        {"filename": "frame_02.png", "timestamp_s": 2.1, "description": "Panoramic view showing the double vanity countertop, sinks, faucets, mirror reflection of the person, and the free-standing tub.\"\n    For estimating, this shows the overall layout and major fixtures like the tub."},
        {"filename": "frame_03.png", "timestamp_s": 3.7, "description": "View showing the free-standing tub and the glass enclosure of the walk-in shower. Provides context of the shower's location relative to other fixtures."},
        {"filename": "frame_04.png", "timestamp_s": 4.8, "description": "Inside the walk-in shower, showing the tiled walls (greyish square tiles), tiled floor (smaller white tiles), existing single fixed shower head, hand shower on a bar, and valve. Crucial for identifying tile types and the current shower configuration."},
        {"filename": "frame_05.png", "timestamp_s": 6.3, "description": "Closer view of the existing shower head (large round black head) and the hand shower with hose on its adjustable bar mount. Identifies fixture types and finishes."},
        {"filename": "frame_06.png", "timestamp_s": 8.1, "description": "View showing the shower valve (circular black handle), the hose connection for the hand shower, and the shower head pipe coming from the wall. Locates the primary plumbing control."},
        {"filename": "frame_07.png", "timestamp_s": 9.2, "description": "View showing the tiled shower wall with a built-in niche containing bottles of toiletries. Provides context for existing wall features."},
        {"filename": "frame_08.png", "timestamp_s": 10.8, "description": "View of the tiled wall where the second shower head is planned. Shows the tile pattern and condition clearly before the pointing begins."},
        {"filename": "frame_10.png", "timestamp_s": 16.4, "description": "The person points towards the area of the existing shower valve and hose connection while explaining that the \"plumbing runs there and into that wall.\" Indicates the origin point of the current plumbing lines."},
        {"filename": "frame_11.png", "timestamp_s": 20.2, "description": "The person gestures towards the tiled wall again, stating the need to \"open up this wall and remove some tile.\" Confirms that the wall where the new head is planned requires demolition and tile removal for plumbing access."},
        {"filename": "frame_12.png", "timestamp_s": 21.9, "description": "Final view of the tiled shower wall, emphasizing the pattern and coverage, just before the video ends. Reinforces the tile material that needs to be dealt with."}
    ]
    key_frames_to_extract = [
        KeyFrame(filename=kf["filename"], timestamp_s=kf["timestamp_s"], description=kf["description"])
        for kf in mock_key_frames_data
    ]

    extracted_frames_info: list[tuple[KeyFrame, Path]] = []
    temp_extraction_path = TEMP_DIR / test_project_id

    try:
        logger.info(f"Attempting to extract frames locally for project {test_project_id} into {temp_extraction_path}")
        extracted_frames_info = await _extract_key_frames_locally(
            local_video_path=str(LOCAL_VIDEO_PATH),
            key_frames=key_frames_to_extract,
            project_id=test_project_id,
            base_temp_dir=TEMP_DIR
        )

        assert extracted_frames_info is not None, "Result of extraction should not be None"
        assert len(extracted_frames_info) == len(key_frames_to_extract), \
            f"Expected {len(key_frames_to_extract)} frames, got {len(extracted_frames_info)}"

        for i, (kf_in, (kf_out, frame_path)) in enumerate(zip(key_frames_to_extract, extracted_frames_info)):
            assert kf_in.filename == kf_out.filename, f"Filename mismatch for frame {i}"
            assert kf_in.timestamp_s == kf_out.timestamp_s, f"Timestamp mismatch for frame {i}"
            assert frame_path.exists(), f"Extracted frame file does not exist: {frame_path}"
            assert frame_path.is_file(), f"Extracted frame path is not a file: {frame_path}"
            logger.info(f"Verified extracted frame: {frame_path}")

    finally:
        # Cleanup: Remove extracted frame files and the temporary project directory
        logger.info(f"Cleaning up temporary files for project {test_project_id} from {temp_extraction_path}")
        # for _, frame_path in extracted_frames_info: # frames from the actual extraction call
        #     if frame_path.exists():
        #         try:
        #             os.remove(frame_path)
        #             logger.info(f"Removed temp frame: {frame_path}")
        #         except OSError as e:
        #             logger.error(f"Error removing temp frame {frame_path}: {e}")
        
        # if temp_extraction_path.exists() and temp_extraction_path.is_dir():
        #     try:
        #         # Attempt to remove the directory itself if it's empty
        #         # For a more robust cleanup, one might use shutil.rmtree, 
        #         # but be cautious with rmtree.
        #         # For this test, os.rmdir should be fine if all files are deleted.
        #         if not any(temp_extraction_path.iterdir()): # Check if empty
        #              os.rmdir(temp_extraction_path)
        #              logger.info(f"Removed temp project directory: {temp_extraction_path}")
        #         else:
        #             logger.warning(f"Temp project directory {temp_extraction_path} was not empty. Manual cleanup might be needed.")
        #     except OSError as e:
        #         logger.error(f"Error removing temp project directory {temp_extraction_path}: {e}")
