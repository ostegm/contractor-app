# BAML Source Directory

This directory contains all BAML schema definitions for the Contractor project. The BAML files define the prompts, clients, and types used across both the web and LangGraph applications.

## Overview

BAML (Boundary Markup Language) provides a way to define, manage, and version control LLM interactions. In this monorepo, BAML is used to generate:

1. TypeScript client for the web app (`apps/web/baml_client/`)
2. Python client for the LangGraph service (`apps/langgraph/baml_client_py/`)

## Development Workflow

1. Define or update BAML schemas in this directory
2. Run `pnpm run dev:baml` from the repo root to generate clients
3. The generated clients will be automatically placed in their respective app directories

## Generator Configuration

The generators are defined in `generators.baml`:

```baml
generator ts_client {
  output_type        "typescript/react"
  output_dir         "../apps/web/baml_client"
  version            "0.86.1"
  default_client_mode async
}

generator py_client {
  output_type        "python/pydantic"
  output_dir         "../apps/langgraph/baml_client_py"
  version            "0.86.1"
  default_client_mode sync
}
```

## Best Practices

1. Keep BAML files focused on a single responsibility
2. Use descriptive names for functions, clients, and types
3. Include tests for BAML functions to ensure proper behavior
4. Document complex prompts with clear comments
5. Review [BAML.md](/BAML.md) in the root directory for full documentation on BAML syntax and usage

## Generated Client Usage

### TypeScript (Web)

```typescript
import { b } from '@/baml_client';

// Using BAML functions
const result = await b.MyBamlFunction({ input: 'value' });
```

### Python (LangGraph)

```python
from baml_client_py import b

# Using BAML functions
result = b.MyBamlFunction(input="value")
```