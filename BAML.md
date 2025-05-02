# BAML Documentation

## Table of Contents

1. [Introduction to BAML](#introduction-to-baml)
2. [Core Concepts](#core-concepts)
3. [BAML Syntax and Structure](#baml-syntax-and-structure)
4. [Clients and Models](#clients-and-models)
5. [Functions](#functions)
6. [Classes and Types](#classes-and-types)
7. [Template Strings](#template-strings)
8. [Generators](#generators)
9. [Working with BAML in Python](#working-with-baml-in-python)
10. [Testing](#testing)
11. [Advanced Patterns](#advanced-patterns)
12. [Examples](#examples)

## Introduction to BAML

BAML (Boundary Markup Language) is a domain-specific language designed for LLM (Large Language Model) prompt engineering and integration. It provides a structured way to define, manage, and version control your LLM interactions, making it easier to build AI-powered applications.

BAML helps solve several challenges in working with LLMs:

- **Type Safety**: Define schemas for inputs and outputs, ensuring type safety across your application
- **Testability**: Write tests for your LLM prompts directly in BAML
- **Code Generation**: Generate client libraries in various languages (Python, TypeScript, etc.)
- **Maintainability**: Separate prompt engineering from application logic
- **Reusability**: Define reusable components like prompts, clients, and functions

## Core Concepts

BAML operates around these fundamental concepts:

1. **Clients**: Define connections to LLM providers (OpenAI, Anthropic, etc.)
2. **Functions**: Define prompt templates with expected inputs and outputs
3. **Classes**: Define data structures used in your prompts
4. **Generators**: Configure how code is generated from your BAML definitions
5. **Tests**: Create tests to verify prompt behavior
6. **Retry Policies**: Define how to handle retries for LLM calls

## BAML Syntax and Structure

BAML files use a `.baml` extension and have a specific structure:

```baml
// Comments start with double slashes

// Define classes (types) at the top
class SomeType {
    field1 string
    field2 integer
    field3 SomeOtherType
}

// Define clients for LLM providers
client<llm> ClientName {
    provider openai
    options {
        model "gpt-4"
        api_key env.OPENAI_API_KEY
    }
}

// Define functions that use classes and clients
function FunctionName(input: InputType) -> OutputType {
    client ClientName
    prompt #"
    Your prompt template here
    with variables like {{ input.field1 }}
    "#
}

// Define retry policies
retry_policy PolicyName {
    max_retries 3
    strategy {
        type exponential_backoff
        delay_ms 300
        multiplier 2.0
    }
}
```

## Clients and Models

Clients in BAML represent connections to LLM providers. They define which model to use and include configuration details.

### Basic Client Definition

```baml
client<llm> GPT4 {
    provider openai
    options {
        model "gpt-4"
        api_key env.OPENAI_API_KEY
    }
}
```

### Client with Retry Policy

```baml
client<llm> GPT4WithRetries {
    provider openai
    retry_policy Exponential
    options {
        model "gpt-4"
        api_key env.OPENAI_API_KEY
    }
}
```

### Fallback Client

You can define a fallback client that tries multiple clients in sequence until one succeeds:

```baml
client<llm> OpenaiFallback {
    provider fallback
    options {
        // This will try the clients in order until one succeeds
        strategy [GPT41With2Retries, GPT41MiniWith2Retries]
    }
}
```

### Custom Providers

You can use generic providers with custom base URLs:

```baml
client<llm> LocalLLM {
    provider "openai-generic"
    options {
        base_url "http://localhost:1234/v1"
        model "local-model-name"
    }
}
```

## Functions

Functions in BAML define interactions with LLMs. They specify:
- Input and output types
- Which client to use
- The prompt template
- Optional context and settings

### Basic Function

```baml
function AnalyzeText(text: string) -> Analysis {
    client GPT4
    prompt #"
    Analyze the following text and extract the key points:
    
    {{ text }}
    
    Provide your analysis in a structured format.
    "#
}
```

### Function with Context

```baml
function DetermineNextAction(thread: Thread) -> RespondToUser | ExecuteCode | DeepResearch {
    client OpenaiFallback
    prompt #"
    You are an expert data analyst.
    
    Based on the following events determine the next action to take:
    {% for event in thread.events %}
    <{{ event.name }}>
    {{ event.data }}
    </{{ event.name }}>
    {% endfor %}
    
    {{ ctx.output_format }}
    "#
}
```

## Classes and Types

Classes in BAML define the data structures used in your application. They are converted to typed classes in the generated code.

### Basic Class Definition

```baml
class User {
    name string
    email string
    age integer
}
```

### Nested Classes

```baml
class Address {
    street string
    city string
    country string
}

class User {
    name string
    email string
    addresses Address[]  // Array of Address objects
}
```

### Union Types

```baml
class Event {
    name string
    data InputFromUser | RespondToUser | ExecuteCode  // Union type
}
```

## Template Strings

BAML uses template strings to define multi-line prompt templates with variable interpolation.

### Basic Template String

```baml
template_string SimpleTemplate() #"
    This is a simple template.
    It can span multiple lines.
"#
```

### Template with Variables

```baml
template_string GreetingTemplate(name: string) #"
    Hello, {{ name }}!
    Welcome to BAML.
"#
```

### Including Templates in Prompts

```baml
function Greet(user: User) -> string {
    client GPT4
    prompt #"
    {{ GreetingTemplate(user.name) }}
    
    How can I help you today?
    "#
}
```

## Generators

Generators define how BAML generates code for your target language or framework.

```baml
generator target {
    // Valid values: "python/pydantic", "typescript", "ruby/sorbet", "rest/openapi"
    output_type "python/pydantic"
    
    // Where the generated code will be saved (relative to baml_src/)
    output_dir "../"
    
    // The version of the BAML package you have installed
    version "0.86.1"
    
    // Valid values: "sync", "async"
    // This controls what `b.FunctionName()` will be (sync or async).
    default_client_mode sync
}
```

## Working with BAML in Python

### Installation

```bash
pip install baml-py
```

### Using Generated BAML Clients

```python
from baml_client import b
from baml_client.types import Thread, Event, InputFromUser

# Create input data
thread = Thread(events=[
    Event(
        name="InputFromUser",
        data=InputFromUser(message="Hello, BAML!")
    )
])

# Call a BAML function
result = b.DetermineNextAction(thread)

# For streaming responses
stream = b.stream.DetermineNextAction(thread)
for partial in stream:
    if hasattr(partial, 'message') and partial.message:
        print(f"Partial: {partial.message}")

# Get the final result
final_result = stream.get_final_response()
```

### Configuring BAML Runtime

```python
import baml_py
from baml_py import BamlRuntime, BamlCtxManager

# Create a custom runtime
runtime = BamlRuntime()
ctx_manager = BamlCtxManager()

# Create a client with the custom runtime
from baml_client.sync_client import BamlSyncClient
custom_client = BamlSyncClient(runtime, ctx_manager)

# Use the custom client
result = custom_client.MyFunction(input_data)
```

## Testing

BAML includes a built-in testing framework for verifying prompt behavior:

```baml
test should_extract_data {
    functions [ExtractData]
    args {
        text "Name: John Doe\nAge: 30\nOccupation: Developer"
    }
    // Optional expected result
    expected {
        name "John Doe"
        age 30
        occupation "Developer"
    }
}
```

## Advanced Patterns

### Retry Policies

```baml
retry_policy Exponential {
    max_retries 2
    strategy {
        type exponential_backoff
        delay_ms 300
        multiplier 1.5
        max_delay_ms 10000
    }
}
```

### Streaming Responses

Functions can be used in streaming mode with the `b.stream` property:

```python
stream = b.stream.DetermineNextAction(thread)
for partial in stream:
    # Process partial responses
    print(partial)
final = stream.get_final_response()
```

### Custom Type Validation

BAML generates strongly-typed clients. In Python, it uses Pydantic for validation:

```python
# The generated code will validate that inputs match the defined schema
try:
    result = b.AnalyzeText("Sample text")
except ValidationError as e:
    print(f"Validation error: {e}")
```

## Examples

### Analyst Prompt Example

```baml
class Thread {
    events Event[]
}

class Event {
    name string
    data InputFromUser | RespondToUser | ExecuteCode | ExecuteCodeResult
}

class InputFromUser {
    message string
}

class RespondToUser {
    message string
}

class ExecuteCode {
    description_of_action string
    code_to_execute string
}

class ExecuteCodeResult {
    results_json string
    images Image[]
}

class Image {
    filename string
    data string
    mime_type string
}

function DetermineNextAction(thread: Thread) -> RespondToUser | ExecuteCode {
    client OpenaiFallback
    prompt #"
    You are an expert data analyst specializing in affiliate marketing.
    
    Based on the following events determine the next action to take:
    {% for event in thread.events %}
    <{{ event.name }}>
    {{ event.data }}
    </{{ event.name }}>
    {% endfor %}
    
    {{ ctx.output_format }}
    "#
}
```

### Using the Generated Client in a Slack App

```python
from baml_client.async_client import b as baml_async
from baml_client.types import Event, InputFromUser, Thread

async def handle_message(text, thread_state):
    # Create or update thread
    if not thread_state:
        thread_state = Thread(events=[])
    
    # Add user input
    thread_state.events.append(Event(
        name="InputFromUser",
        data=InputFromUser(message=text)
    ))
    
    # Get next action from BAML function
    next_action = await baml_async.DetermineNextAction(thread=thread_state)
    
    # Process the action (respond, execute code, etc.)
    if hasattr(next_action, 'message'):
        return next_action.message
    elif hasattr(next_action, 'code_to_execute'):
        # Execute code and handle result
        pass
    
    return "I'm not sure how to respond."
```
