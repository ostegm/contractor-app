import pytest
import os
import base64
from pathlib import Path
from dotenv import load_dotenv
import aiohttp

from file_processor.graph import download_from_url


@pytest.mark.asyncio
async def test_successful_download() -> None:
    """Test downloading content from a valid URL."""
    # Use a reliable test image URL
    image_url = "https://httpbin.org/image/png"
    
    # Download the content
    content = await download_from_url(image_url)
    
    # Verify the content is a base64-encoded string
    assert isinstance(content, str)
    # Verify it's a valid base64 string
    try:
        decoded = base64.b64decode(content)
        assert len(decoded) > 0
    except Exception as e:
        pytest.fail(f"Failed to decode base64 content: {str(e)}")


@pytest.mark.asyncio
async def test_text_download() -> None:
    """Test downloading text content from a URL."""
    # Use a reliable text URL
    text_url = "https://httpbin.org/get"
    
    # Download the content
    content = await download_from_url(text_url)
    
    # Verify the content is a string and contains expected data
    assert isinstance(content, str)
    assert "url" in content
    assert "httpbin.org" in content


@pytest.mark.asyncio
async def test_download_with_invalid_url() -> None:
    """Test that downloading from an invalid URL raises an exception."""
    # Invalid URL that should fail
    invalid_url = "https://example.com/nonexistent-resource.xyz"
    
    # The download_from_url function should raise an exception
    with pytest.raises(Exception) as excinfo:
        await download_from_url(invalid_url)
    
    # Verify that the error message contains information about the failed download
    assert "Failed to download" in str(excinfo.value) or "download" in str(excinfo.value).lower()


@pytest.mark.asyncio
async def test_download_with_nonexistent_domain() -> None:
    """Test that downloading from a nonexistent domain raises an exception."""
    # URL with nonexistent domain
    nonexistent_domain = "https://this-domain-definitely-does-not-exist-123456789.com/image.png"
    
    # The download_from_url function should raise an exception
    with pytest.raises(Exception) as excinfo:
        await download_from_url(nonexistent_domain)
    
    # The error could be DNS-related or connection-related
    error_msg = str(excinfo.value).lower()
    assert any(term in error_msg for term in ["dns", "connect", "resolve", "find", "host", "name"]) 