# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Using baml
 - Review BAML.md as needed for details on how to work with baml files.

## Build & Test Commands
- Install dependencies: `pip install -e ".[dev]"`
- Generate BAML client: `baml generate`
- Run all tests: `pytest`
- Run single test: `pytest tests/path_to_test.py::test_function_name -v`
- Run tests with coverage: `pytest --cov=baml_client`
- Lint code: `ruff check .`
- Type check: `mypy .`

## Code Style Guidelines
- **Formatting**: Use Black for Python code formatting
- **Imports**: Group imports in this order: standard library, third-party, local application
- **Types**: Use type annotations for all functions and methods
- **Naming**: 
  - Classes: PascalCase
  - Functions/methods: snake_case
  - Constants: UPPER_SNAKE_CASE
  - BAML entities: PascalCase (functions, clients, classes)
- **Error Handling**: Use specific exceptions with helpful error messages
- **BAML Patterns**: Keep prompt templates clean and well-structured
- **Tests**: Write test cases for all BAML functions to ensure prompt behavior