import pytest
import base64
import os
from pathlib import Path
from dotenv import load_dotenv

from file_processor import graph
from file_processor.state import State, File


@pytest.mark.asyncio
@pytest.mark.skip(reason="Skipping test due to Google API key not being set")
async def test_file_processor_workflow() -> None:
    """Test the file processor workflow with a simple example."""
    # Load environment variables from .env file
    load_dotenv()
    
    # Check if Google API key is set
    if not os.getenv("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY environment variable is not set")
    
    # Check if OpenAI API key is set
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY environment variable is not set")
    
    # Path to the test image
    image_path = Path(__file__).parent.parent / "testdata" / "dated-bathroom.png"
    
    # Check if the image exists
    if not image_path.exists():
        pytest.skip(f"Test image not found at {image_path}")
    
    # Read the image file and encode it as base64
    with open(image_path, "rb") as img_file:
        image_content = base64.b64encode(img_file.read()).decode("utf-8")
    
    # Create test files using the File class
    client_requirements = File(
        type="text",
        name="client_requirements.txt",
        content="The client wants modern cabinets, quartz countertops, and a kitchen island."
    )
    
    bathroom_image = File(
        type="image",
        name="current_bathroom.png",
        content=image_content,
        description="Image shows a dated bathroom with beige tile, a shower/tub combo, single vanity with cultured marble top, and limited storage. The bathroom has oak cabinets and patterned floor tiles."
    )
    
    measurements = File(
        type="text",
        name="measurements.txt",
        content="Kitchen dimensions: 12ft x 14ft. Window on north wall. Plumbing on east wall."
    )
    
    # Create a test state
    state = State(
        project_info="# Kitchen Renovation Project\n\nInitial assessment for kitchen renovation.",
        files=[client_requirements, bathroom_image, measurements]
    )
    
    # Run the graph
    result = await graph.ainvoke(state)
    
    # Verify the result
    assert "updated_project_info" in result
    assert isinstance(result["updated_project_info"], str)
    assert len(result["updated_project_info"]) > len(state.project_info)
    
    # Check that key information was incorporated
    assert "quartz countertops" in result["updated_project_info"].lower() or "countertops" in result["updated_project_info"].lower()
    assert "cabinets" in result["updated_project_info"].lower()
    assert "kitchen" in result["updated_project_info"].lower()
    assert "bathroom" in result["updated_project_info"].lower()  # Should now include bathroom info from the image
    
    # Verify the AI estimate
    assert "ai_estimate" in result
    assert result["ai_estimate"] is not None
    
    # Check the structure of the AI estimate
    estimate = result["ai_estimate"]
    assert hasattr(estimate, "project_description")
    assert hasattr(estimate, "estimated_total_min")
    assert hasattr(estimate, "estimated_total_max")
    assert hasattr(estimate, "confidence_level")
    assert hasattr(estimate, "estimate_items")
    assert hasattr(estimate, "next_steps")
    assert hasattr(estimate, "missing_information")
    assert hasattr(estimate, "key_risks")
    
    # Check that the estimate contains line items
    assert len(estimate.estimate_items) > 0
    
    # Check the first line item
    first_item = estimate.estimate_items[0]
    assert hasattr(first_item, "description")
    assert hasattr(first_item, "category")
    assert hasattr(first_item, "cost_range_min")
    assert hasattr(first_item, "cost_range_max")
