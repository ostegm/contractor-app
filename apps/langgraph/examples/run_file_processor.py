#!/usr/bin/env python
"""Example script to demonstrate how to use the file processor agent."""

import asyncio
import os
import base64
import json
from pathlib import Path
from dotenv import load_dotenv

from file_processor import graph
from file_processor.state import State, File


async def main():
    """Run the file processor agent with example inputs."""
    # Load environment variables
    load_dotenv()
    
    # Check if Google API key is set
    if not os.getenv("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY environment variable is not set.")
        print("Please set it in your .env file or environment.")
        return
        
    # Check if OpenAI API key is set
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable is not set.")
        print("Please set it in your .env file or environment.")
        return
    
    # Path to the test image
    image_path = Path(__file__).parent.parent / "tests" / "testdata" / "dated-bathroom.png"
    
    # Check if the image exists
    if not image_path.exists():
        print(f"Error: Test image not found at {image_path}")
        return
    
    # Read the image file and encode it as base64
    with open(image_path, "rb") as img_file:
        image_content = base64.b64encode(img_file.read()).decode("utf-8")
    
    # Create example files using the File class
    client_notes = File(
        type="text",
        name="client_notes.txt",
        content="Client wants a modern bathroom with a walk-in shower, double vanity, and heated floors. Budget is $15,000-$20,000. Timeline: would like to complete within 3 months."
    )
    
    bathroom_image = File(
        type="image",
        name="current_bathroom.png",
        content=image_content,  # Include the actual image content
        description="Image shows a dated bathroom with beige tile, a shower/tub combo, single vanity with cultured marble top, and limited storage. The bathroom has oak cabinets and patterned floor tiles."
    )
    
    measurements = File(
        type="text",
        name="measurements.txt",
        content="Bathroom dimensions: 8ft x 10ft. Ceiling height: 8ft. Window on east wall. Plumbing on north and west walls."
    )
    
    # Create example state with project information and files
    state = State(
        project_info="# Bathroom Renovation Project\n\nInitial consultation for bathroom renovation in a 1990s home.",
        files=[client_notes, bathroom_image, measurements]
    )
    
    print("Processing files for bathroom renovation project...")
    print("Using actual bathroom image from tests/testdata/dated-bathroom.png")
    
    # Run the graph
    result = await graph.ainvoke(state)
    
    # Print the updated project information
    print("\n--- Updated Project Information ---\n")
    print(result["updated_project_info"])
    
    # Print the AI-generated estimate
    print("\n--- AI-Generated Estimate ---\n")
    
    estimate = result["ai_estimate"]
    
    print(f"Project Description: {estimate.project_description}")
    print(f"Estimated Cost Range: ${estimate.estimated_total_min:,.2f} - ${estimate.estimated_total_max:,.2f}")
    if estimate.estimated_timeline_days:
        print(f"Estimated Timeline: {estimate.estimated_timeline_days} days")
    print(f"Overall Confidence Level: {estimate.confidence_level}")
    
    print("\n--- Key Considerations ---")
    for item in estimate.key_considerations:
        print(f"• {item}")
    
    print("\n--- Estimate Line Items ---")
    for item in estimate.estimate_items:
        print(f"\n• {item.description} ({item.category})")
        print(f"  Cost Range: ${item.cost_range_min:,.2f} - ${item.cost_range_max:,.2f}")
        if item.quantity and item.unit:
            print(f"  Quantity: {item.quantity} {item.unit}")
        if item.confidence_score:
            print(f"  Confidence: {item.confidence_score}")
        if item.assumptions:
            print(f"  Assumptions: {item.assumptions}")
    
    print("\n--- Next Steps ---")
    for item in estimate.next_steps:
        print(f"• {item}")
    
    print("\n--- Missing Information ---")
    for item in estimate.missing_information:
        print(f"• {item}")
    
    print("\n--- Key Risks ---")
    for item in estimate.key_risks:
        print(f"• {item}")
    
    # Save the estimate to a JSON file
    with open("construction_estimate.json", "w") as f:
        # Convert Pydantic model to dict and then to JSON
        estimate_dict = estimate.model_dump()
        f.write(json.dumps(estimate_dict, indent=2))
    print("\nEstimate saved to construction_estimate.json")


if __name__ == "__main__":
    asyncio.run(main()) 