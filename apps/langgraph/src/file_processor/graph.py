"""File processor for understanding a project from a set of files."""

import base64
import json
import logging
from typing import Any, Dict, List
import aiohttp

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph

from file_processor import configuration as config_lib
from file_processor.state import State, File, ConstructionProjectData


# Set up logging
logger = logging.getLogger(__name__)


async def download_from_url(url: str) -> str:
    """Download content from a URL and encode it as base64 if it's binary.
    
    Args:
        url: The URL to download content from.
        
    Returns:
        The content as a string. For binary content, it will be base64-encoded.
        
    Raises:
        Exception: If there's an error downloading the content.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"Failed to download from URL: {response.status}")
                
                # Check content type to determine if it's binary
                content_type = response.headers.get('Content-Type', '')
                
                if content_type.startswith(('image/', 'video/', 'audio/')):
                    # For binary content, read as bytes and encode as base64
                    content = await response.read()
                    return base64.b64encode(content).decode('utf-8')
                else:
                    # For text content, return as is
                    return await response.text()
    except Exception as e:
        logger.error(f"Error downloading from URL {url}: {str(e)}")
        raise


async def process_files(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Process the files and update the project information."""
    logger.info("Processing files...")
    configuration = config_lib.Configuration.from_runnable_config(config)
    
    # Initialize the model
    model = ChatGoogleGenerativeAI(
        model=configuration.file_processor_model_name,
        temperature=configuration.file_processor_temperature,
    )
    
    # Process files information with better organization by file type
    files_info = ""
    
    # Group files by type for better context
    image_files = []
    video_files = []
    text_files = []
    voice_notes = []
    
    for file in state.files:
        # If the file has a URL but no content, download the content
        if file.url and not file.content:
            try:
                logger.info(f"Downloading content from URL for file: {file.name}")
                file.content = await download_from_url(file.url)
                logger.info(f"Successfully downloaded content for file: {file.name}")
            except Exception as e:
                error_msg = f"Failed to download content for file {file.name}: {str(e)}"
                logger.error(error_msg)
                # Raise the exception instead of continuing
                raise Exception(error_msg)
                
        if file.type.lower() == "image":
            image_files.append(file)
        elif file.type.lower() == "video":
            video_files.append(file)
        elif file.type.lower() == "audio":
            voice_notes.append(file)
        else:
            text_files.append(file)
    
    # Add video information
    if video_files:
        files_info += "## VIDEO WALKTHROUGH:\n"
        for idx, file in enumerate(video_files, 1):
            files_info += f"Video {idx}: {file.name}\n"
            files_info += f"Description: {file.description or 'No description available'}\n\n"
    
    # Add image information
    if image_files:
        files_info += "## SITE IMAGES:\n"
        for idx, file in enumerate(image_files, 1):
            files_info += f"Image {idx}: {file.name}\n"
            files_info += f"Description: {file.description or 'No description available'}\n\n"
    
    # Add voice note transcriptions
    if voice_notes:
        files_info += "## VOICE NOTES (TRANSCRIBED):\n"
        for idx, file in enumerate(voice_notes, 1):
            files_info += f"Voice Note {idx}: {file.name}\n"
            files_info += f"Content:\n{file.content or 'No transcription available'}\n\n"
    
    # Add text notes
    if text_files:
        files_info += "## TEXT NOTES AND MEASUREMENTS:\n"
        for idx, file in enumerate(text_files, 1):
            files_info += f"Document {idx}: {file.name}\n"
            files_info += f"Content:\n{file.content or 'No content available'}\n\n"
    
    # Build input messages (system message with instructions and user message with media).
    system_message = SystemMessage(content=config_lib.FILE_PROCESSOR_SYSTEM_INSTRUCTIONS)
    files_prompt = config_lib.FILE_PROCESSOR_HUMAN_MESSAGE_TEMPLATE.format(
        project_info=state.project_info,
        files_info=files_info
    )
    user_message = HumanMessage(content=files_prompt)
    # Run model, extract response and update state.
    logger.info("Making LLM call to process files...")
    response = await model.ainvoke([system_message, user_message])
    updated_project_info = response.content
    logger.info("Successfully processed files.")
    return {"updated_project_info": updated_project_info}


async def generate_estimate(state: State, config: RunnableConfig) -> Dict[str, Any]:
    """Generate a structured construction estimate from the project assessment."""
    configuration = config_lib.Configuration.from_runnable_config(config)
    
    # Initialize the model
    model = ChatOpenAI(
        model=configuration.estimate_generator_model_name,
        temperature=configuration.estimate_generator_temperature,
    )
    
    # Build input messages
    system_message = SystemMessage(content=config_lib.ESTIMATE_GENERATOR_SYSTEM_INSTRUCTIONS)
    estimate_prompt = config_lib.ESTIMATE_GENERATOR_HUMAN_MESSAGE_TEMPLATE.format(
        project_assessment=state.updated_project_info
    )
    user_message = HumanMessage(content=estimate_prompt)
    
    # Run model with structured output
    try:
        logger.info("Generating construction estimate...")
        response = await model.with_structured_output(ConstructionProjectData).ainvoke(
            [system_message, user_message]
        )
        logger.info("Successfully generated construction estimate")
        
        return {"ai_estimate": response}
    except Exception as e:
        error_msg = f"Failed to generate construction estimate: {str(e)}"
        logger.error(error_msg)
        raise Exception(error_msg)


# Define a new graph
workflow = StateGraph(State, config_schema=config_lib.Configuration)

workflow.add_node("process_files", process_files)
workflow.add_node("generate_estimate", generate_estimate)

workflow.add_edge("__start__", "process_files")
workflow.add_edge("process_files", "generate_estimate")
workflow.set_finish_point("generate_estimate")

# Compile the workflow into an executable graph
graph = workflow.compile()
graph.name = "Construction Project Estimate Assistant"
