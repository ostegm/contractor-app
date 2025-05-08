
"""Define the state structures for the agent."""
from __future__ import annotations

from dataclasses import dataclass, field, fields
from typing import List, Optional, Union

from .baml_client.types import ConstructionProjectData, InputFile
from langchain_core.runnables import RunnableConfig


@dataclass
class State:
    """Defines the input state for the agent, representing a narrower interface to the outside world.

    This class is used to define the initial state and structure of incoming data.
    See: https://langchain-ai.github.io/langgraph/concepts/low_level/#state
    for more information.
    """

    # List of files to process (could be videos, text, pictures, voice recordings)
    files: List[Union[InputFile]] = field(default_factory=list)
    
    # The user's requested changes to the estimate
    requested_changes: Optional[str] = None

    # AI-generated construction estimate in JSON format
    ai_estimate: Optional[ConstructionProjectData] = None


@dataclass(kw_only=True)
class Configuration:
    """The configuration for the agent."""
    

    @classmethod
    def from_runnable_config(
        cls, config: Optional[RunnableConfig] = None
    ) -> Configuration:
        """Create a Configuration instance from a RunnableConfig object."""
        configurable = (config.get("configurable") or {}) if config else {}
        _fields = {f.name for f in fields(cls) if f.init}
        return cls(**{k: v for k, v in configurable.items() if k in _fields})