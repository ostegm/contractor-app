"""Tests for the PDF processing workflow.

uv run pytest tests/unit_tests/test_pdf_processing_unit.py -v --log-cli-level=INFO
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


import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
import base64

from apps.langgraph.src.file_processor.graph import process_files
from apps.langgraph.src.file_processor.state import State
from baml_py import Image

# Path to the test files in the apps/langgraph/tests/testdata directory
_testdata_dir = _test_file_dir.parent / "testdata"
TEST_PDF_FILENAME = "plans_3_pages.pdf"
TEST_IMAGE_FILENAME = "dated-bathroom.png"
TEST_PDF_PATH = f"{_testdata_dir}/{TEST_PDF_FILENAME}"
TEST_IMAGE_PATH = f"{_testdata_dir}/{TEST_IMAGE_FILENAME}"

# Helper to read file bytes for mocking download
def read_test_file_bytes(file_path: str) -> bytes:
    try:
        with open(file_path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        pytest.fail(f"Test data file not found: {file_path}. Check CWD or path construction.")


@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.convert_from_bytes')
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_pdf_successfully(mock_download_from_url, mock_convert_from_bytes):
    """Tests successful processing of a PDF file into multiple image InputFiles."""
    pdf_file_content = read_test_file_bytes(TEST_PDF_PATH)
    mock_download_from_url.return_value = pdf_file_content

    # Mock pdf2image.convert_from_bytes to return 3 mock PIL Image objects
    # Each mock PIL image needs a 'save' method.
    def mock_save_method(byte_io_array, format):
        # Simulate saving some bytes to the BytesIO array if needed for any downstream checks,
        # though for this test, the content of image_page_bytes isn't deeply verified beyond type.
        byte_io_array.write(b"fake_image_bytes_for_page")

    mock_pil_images = []
    for _ in range(3):
        mock_pil_image = MagicMock()
        mock_pil_image.save = MagicMock(side_effect=mock_save_method)
        mock_pil_images.append(mock_pil_image)
    
    mock_convert_from_bytes.return_value = mock_pil_images # Simulate 3 pages

    initial_file = {
        "name": "plans_3_pages.pdf",
        "type": "application/pdf",
        "description": "Test PDF for plans",
        "download_url": "http://fakeurl.com/plans_3_pages.pdf"
    }
    state = State(files=[initial_file])

    result = await process_files(state)
    processed_files = result["files"]

    assert len(processed_files) == 3
    mock_download_from_url.assert_called_once_with("http://fakeurl.com/plans_3_pages.pdf", as_bytes=True, expected_mime_type_prefix="application/pdf")
    mock_convert_from_bytes.assert_called_once_with(pdf_file_content, dpi=150)

    for i, p_file in enumerate(processed_files):
        page_num = i + 1
        assert p_file.name == f"plans_3_pages_page_{page_num}.png"
        assert p_file.type == "image/png"
        assert p_file.description == f"Page {page_num} of PDF document: Test PDF for plans"
        assert isinstance(p_file.image_data, Image)
        # Assuming Image.from_base64 results in an Image object that internally handles the b64 string.
        # We can check if it's not None. If BAML Image has a method to get original type or data, that could be used.
        assert p_file.image_data is not None # Accessing internal representation for test
        assert p_file.content is None
        assert p_file.audio_data is None
        assert p_file.download_url is None

@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.convert_from_bytes')
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_pdf_empty_conversion_failure(mock_download_from_url, mock_convert_from_bytes):
    """Tests that an error is raised if PDF conversion yields no pages."""
    pdf_file_content = b"fake pdf content"
    mock_download_from_url.return_value = pdf_file_content
    mock_convert_from_bytes.return_value = [] # Simulate conversion yielding zero pages

    initial_file = {
        "name": "empty_conversion.pdf",
        "type": "application/pdf",
        "description": "Empty PDF",
        "download_url": "http://fakeurl.com/empty_conversion.pdf"
    }
    state = State(files=[initial_file])

    with pytest.raises(Exception, match="PDF file empty_conversion.pdf converted to zero pages/images."):
        await process_files(state)

@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.convert_from_bytes')
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_pdf_conversion_exception_propagates(mock_download_from_url, mock_convert_from_bytes):
    """Tests that an error from pdf2image.convert_from_bytes is propagated."""
    pdf_file_content = b"fake pdf content"
    mock_download_from_url.return_value = pdf_file_content
    mock_convert_from_bytes.side_effect = Exception("PDF rendering failed miserably")

    initial_file = {
        "name": "broken.pdf",
        "type": "application/pdf",
        "description": "Broken PDF",
        "download_url": "http://fakeurl.com/broken.pdf"
    }
    state = State(files=[initial_file])

    with pytest.raises(Exception, match="PDF rendering failed miserably"):
        await process_files(state)

@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_files_handles_image_type_correctly(mock_download_from_url):
    """Tests that plain image files are still handled correctly."""
    image_file_content = read_test_file_bytes(TEST_IMAGE_PATH)
    mock_download_from_url.return_value = image_file_content
    
    initial_file = {
        "name": "test_image.png",
        "type": "image/png",
        "description": "A test image",
        "download_url": "http://fakeurl.com/test_image.png"
    }
    state = State(files=[initial_file])

    result = await process_files(state)
    processed_files = result["files"]

    assert len(processed_files) == 1
    p_file = processed_files[0]
    assert p_file.name == "test_image.png"
    assert p_file.type == "image/png"
    assert isinstance(p_file.image_data, Image)
    mock_download_from_url.assert_called_once_with("http://fakeurl.com/test_image.png", as_bytes=True, expected_mime_type_prefix="image/")

@pytest.mark.asyncio
async def test_process_files_no_download_url_raises_error():
    """Tests that an error is raised if a file has no download_url."""
    initial_file = {
        "name": "no_url_file.txt",
        "type": "text/plain",
        "description": "File without a URL",
        "download_url": None # Explicitly None
    }
    state = State(files=[initial_file])

    with pytest.raises(Exception, match="File no_url_file.txt has no download_url, cannot process."):
        await process_files(state)

@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
@patch('apps.langgraph.src.file_processor.graph.b.ProcessAudio', new_callable=AsyncMock) # Mock BAML call
async def test_process_files_handles_audio_type_correctly(mock_process_audio, mock_download_from_url):
    """Tests that audio files are transcribed and handled."""
    audio_file_content = b"fake audio data"
    mock_download_from_url.return_value = audio_file_content
    mock_process_audio.return_value = "This is a transcription."

    initial_file = {
        "name": "test_audio.mp3",
        "type": "audio/mpeg",
        "description": "A test audio file",
        "download_url": "http://fakeurl.com/test_audio.mp3"
    }
    state = State(files=[initial_file])

    result = await process_files(state)
    processed_files = result["files"]

    assert len(processed_files) == 1
    p_file = processed_files[0]
    assert p_file.name == "test_audio.mp3"
    assert p_file.type == "text/plain" # Type changes after transcription
    assert p_file.content == "This is a transcription."
    assert p_file.audio_data is None # Audio data cleared
    assert p_file.image_data is None 
    mock_download_from_url.assert_called_once_with("http://fakeurl.com/test_audio.mp3", as_bytes=True, expected_mime_type_prefix="audio/")
    mock_process_audio.assert_called_once()


@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_files_handles_text_type_correctly(mock_download_from_url):
    """Tests that text files are downloaded and content is stored."""
    text_content_str = "Hello, world!"
    # download_from_url for text returns string
    mock_download_from_url.return_value = text_content_str

    initial_file = {
        "name": "test_text.txt",
        "type": "text/plain",
        "description": "A test text file",
        "download_url": "http://fakeurl.com/test_text.txt"
    }
    state = State(files=[initial_file])

    result = await process_files(state)
    processed_files = result["files"]

    assert len(processed_files) == 1
    p_file = processed_files[0]
    assert p_file.name == "test_text.txt"
    assert p_file.type == "text/plain"
    assert p_file.content == "Hello, world!"
    mock_download_from_url.assert_called_once_with("http://fakeurl.com/test_text.txt", as_bytes=False, expected_mime_type_prefix="text/")

@pytest.mark.asyncio
@patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock)
async def test_process_files_handles_unsupported_type_correctly(mock_download_from_url):
    """Tests that unsupported file types are base64 encoded."""
    binary_content = b"\x01\x02\x03\x04" # Raw bytes
    mock_download_from_url.return_value = binary_content

    initial_file = {
        "name": "test_unknown.zip",
        "type": "application/zip", # An unsupported type
        "description": "A test ZIP file",
        "download_url": "http://fakeurl.com/test_unknown.zip"
    }
    state = State(files=[initial_file])

    result = await process_files(state)
    processed_files = result["files"]
    
    assert len(processed_files) == 0


@pytest.mark.asyncio
async def test_process_files_skips_video_files_with_warning(caplog):
    """Tests that video files are currently skipped with a warning."""
    initial_file = {
        "name": "test_video.mp4",
        "type": "video/mp4",
        "description": "A test video file",
        "download_url": "http://fakeurl.com/test_video.mp4" 
    }
    state = State(files=[initial_file])

    # Mock download_from_url to ensure it's not called for videos due to early skip
    with patch('apps.langgraph.src.file_processor.graph.download_from_url', new_callable=AsyncMock) as mock_download:
        result = await process_files(state)
        processed_files = result["files"]
        mock_download.assert_not_called() # Should not be called for video

    assert len(processed_files) == 0 
    assert "Skipping video file: test_video.mp4" in caplog.text 