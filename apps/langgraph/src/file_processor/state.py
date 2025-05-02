"""Define the state structures for the agent."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Union
from pydantic import BaseModel, Field


class EstimateLineItem(BaseModel):
    """Represents a line item in a construction estimate."""
    description: str = Field(description="Description of the work item or material")
    category: str = Field(description="Category of the item (e.g., Demo, Plumbing, Electrical, etc.)")
    subcategory: Optional[str] = Field(description="Subcategory for further classification", default=None)
    cost_range_min: float = Field(description="Minimum estimated cost in dollars")
    cost_range_max: float = Field(description="Maximum estimated cost in dollars")
    unit: Optional[str] = Field(description="Unit of measurement (e.g., hours, sq ft, linear ft)", default=None)
    quantity: Optional[float] = Field(description="Estimated quantity", default=None)
    assumptions: Optional[str] = Field(description="Key assumptions made for this line item", default=None)
    confidence_score: Optional[str] = Field(description="Confidence in the estimate based on the information provided: (High, Medium, Low)", default=None)
    notes: Optional[str] = Field(description="Additional notes or details", default=None)


class ConstructionProjectData(BaseModel):
    """Represents structured data for a construction project estimate."""
    project_description: str = Field(description="Brief summary of the project scope")
    estimated_total_min: Optional[float] = Field(description="Minimum total estimated cost", default=None)
    estimated_total_max: Optional[float] = Field(description="Maximum total estimated cost", default=None)
    estimated_timeline_days: Optional[int] = Field(description="Estimated project duration in days", default=None)
    key_considerations: List[str] = Field(description="List of key considerations for this project")
    confidence_level: str = Field(description="Overall confidence level in the estimate (High, Medium, Low)")
    estimate_items: List[EstimateLineItem] = Field(description="Line items for the estimate")
    next_steps: List[str] = Field(description="Prioritized next steps for the contractor")
    missing_information: List[str] = Field(description="Information needed to improve estimate accuracy")
    key_risks: List[str] = Field(description="List of key risks or potential complications")


@dataclass
class File:
    """Represents a file to be processed by the agent.
    
    This class provides a structured representation of different file types
    that can be processed by the agent, including text files, images, videos,
    and voice recordings.
    
    Attributes:
        name: The name of the file, including extension.
        type: The type of file (e.g., "text", "image", "video", "audio").
        content: The content of the file. For text files, this is the actual text.
                For binary files like images, this can be base64-encoded content.
        url: A URL to download the file content from (e.g., Supabase signed URL).
        description: A textual description of the file's content, especially useful
                    for media files like images and videos.
        metadata: Additional metadata about the file as key-value pairs.
    """
    
    name: str
    type: str
    content: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def from_dict(cls, file_dict: Dict[str, Any]) -> File:
        """Create a File object from a dictionary representation.
        
        Args:
            file_dict: Dictionary containing file information.
            
        Returns:
            A File object.
        """
        # Extract known fields
        name = file_dict.get("name", "Unnamed")
        file_type = file_dict.get("type", "Unknown")
        content = file_dict.get("content")
        url = file_dict.get("url")
        description = file_dict.get("description")
        
        # Any other fields go into metadata
        metadata = {k: v for k, v in file_dict.items() 
                   if k not in ["name", "type", "content", "url", "description"]}
        
        return cls(
            name=name,
            type=file_type,
            content=content,
            url=url,
            description=description,
            metadata=metadata
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert the File object to a dictionary.
        
        Returns:
            A dictionary representation of the File.
        """
        result = {
            "name": self.name,
            "type": self.type,
        }
        
        if self.content is not None:
            result["content"] = self.content
            
        if self.url is not None:
            result["url"] = self.url
            
        if self.description is not None:
            result["description"] = self.description
            
        # Add any metadata
        result.update(self.metadata)
        
        return result


@dataclass
class State:
    """Defines the input state for the agent, representing a narrower interface to the outside world.

    This class is used to define the initial state and structure of incoming data.
    See: https://langchain-ai.github.io/langgraph/concepts/low_level/#state
    for more information.
    """

    # Current project information in markdown format
    project_info: str = ""
    
    # List of files to process (could be videos, text, pictures, voice recordings)
    files: List[Union[File, Dict[str, Any]]] = field(default_factory=list)
    
    # Updated project information after processing
    updated_project_info: str = ""
    
    # AI-generated construction estimate in JSON format
    ai_estimate: Optional[ConstructionProjectData] = None
    
    def __post_init__(self):
        """Convert any dictionary files to File objects after initialization."""
        processed_files = []
        for file in self.files:
            if isinstance(file, dict):
                processed_files.append(File.from_dict(file))
            else:
                processed_files.append(file)
        self.files = processed_files
