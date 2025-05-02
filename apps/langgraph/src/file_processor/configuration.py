"""Define the configurable parameters for the agent."""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Optional

from langchain_core.runnables import RunnableConfig


@dataclass(kw_only=True)
class Configuration:
    """The configuration for the agent."""

    # File processor configuration
    file_processor_model_name: str = "gemini-2.5-flash-preview-04-17"
    file_processor_temperature: float = 0.7
    
    # Estimate generator configuration
    estimate_generator_model_name: str = "gpt-4.1"
    estimate_generator_temperature: float = 0.0
    

    @classmethod
    def from_runnable_config(
        cls, config: Optional[RunnableConfig] = None
    ) -> Configuration:
        """Create a Configuration instance from a RunnableConfig object."""
        configurable = (config.get("configurable") or {}) if config else {}
        _fields = {f.name for f in fields(cls) if f.init}
        return cls(**{k: v for k, v in configurable.items() if k in _fields})



FILE_PROCESSOR_SYSTEM_INSTRUCTIONS = """
You are analyzing a construction project site using multiple sources: video walkthroughs, images, text notes, and voice transcriptions. Your task is to create a comprehensive project assessment that captures ALL relevant details for an accurate cost estimate. This will be the only documentation available for reference during estimating.

Please provide a detailed analysis structured as follows:

1. SITE ASSESSMENT
   - Dimensions and measurements of all areas
   - Existing structures and conditions (include timestamps when visible in video)
   - Access points and logistical considerations
   - Environmental factors and constraints

2. SCOPE BREAKDOWN (by area/room)
   - Demolition requirements
   - New construction elements
   - Repairs and renovations
   - Specialty work requirements

3. MATERIALS ANALYSIS
   - Required materials with quantities where possible
   - Existing materials that may be reused or require disposal
   - Quality and grade recommendations
   - Estimated material quantities and potential suppliers

4. TECHNICAL REQUIREMENTS
   - Structural considerations
   - Electrical, plumbing, and mechanical needs
   - Code compliance issues
   - Specialized equipment requirements

5. LABOR ESTIMATION FACTORS
   - Work complexity assessment
   - Access challenges
   - Sequencing requirements
   - Specialty labor needs
   - Estimated labor hours by trade (if possible)

6. KEY COST DRIVERS
   - Critical items likely to impact budget (RANKED by estimated impact)
   - Potential complications or uncertainties
   - Recommendations for further investigation
   - Budget impact sensitivity assessment

7. CONFIDENCE ASSESSMENT
   - Rate your confidence (High/Medium/Low) in each major aspect of this analysis
   - Identify areas where additional information would be most valuable
   - Note any elements where you made significant assumptions

8. MISSING INFORMATION
   - List specific measurements, details, or documentation that would significantly improve estimate accuracy
   - Rank missing information by importance to the estimate
   - Suggest specific types of photos, videos, or measurements that would be most valuable to collect

9. IMMEDIATE ACTION ITEMS
   - List 3-5 critical next steps the contractor should take
   - Identify any measurements or verifications that must be performed first
   - Flag any time-sensitive items (permits, long lead materials, etc.)

10. SYNTHESIS FROM MULTIPLE SOURCES
   - Correlate information between visual and text sources
   - Highlight any discrepancies between different materials
   - Integrate measurements mentioned in voice notes with visual evidence
   - Note specific timestamps from videos that provide crucial information

Format your response with clear sections, use bullet points for details, and include specific references to source materials where possible (e.g., "As shown in image 2..." or "According to voice note 3..." or "At timestamp 2:45 in the video...").
Do not respond to the user, just output the project assesment. 
"""

FILE_PROCESSOR_HUMAN_MESSAGE_TEMPLATE = """
CURRENT PROJECT INFORMATION:
{project_info}

AVAILABLE MEDIA FOR INCREASING UNDERSTANDING:
{files_info}
"""

ESTIMATE_GENERATOR_SYSTEM_INSTRUCTIONS = """
You are a specialized AI assistant for construction estimation. Your task is to extract structured data from a construction project assessment.

Analyze the provided construction assessment text and extract key information to create a detailed construction estimate.
Focus on identifying project scope, costs, timeline, key considerations, and risks.

Keep your analysis concise but comprehensive, focusing on the most important elements.
"""

ESTIMATE_GENERATOR_HUMAN_MESSAGE_TEMPLATE = """
Please analyze the following construction project assessment and generate a structured estimate:

{project_assessment}
"""