from file_processor.configuration import Configuration


def test_configuration_empty() -> None:
    """Test that the configuration can be created with empty config."""
    config = Configuration.from_runnable_config({})
    assert config.model_name == "gemini-2.0-flash-thinking-exp-01-21"
    assert config.temperature == 0.7
    assert "expert contractor" in config.base_prompt
    assert "Current Project Information" in config.file_processor_prompt


def test_configuration_custom() -> None:
    """Test that the configuration can be created with custom values."""
    custom_config = {
        "configurable": {
            "model_name": "custom-model",
            "temperature": 0.5,
            "base_prompt": "Custom prompt",
            "file_processor_prompt": "Custom file processor prompt"
        }
    }
    config = Configuration.from_runnable_config(custom_config)
    assert config.model_name == "custom-model"
    assert config.temperature == 0.5
    assert config.base_prompt == "Custom prompt"
    assert config.file_processor_prompt == "Custom file processor prompt"
