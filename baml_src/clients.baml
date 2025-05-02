// https://docs.boundaryml.com/docs/snippets/clients/fallback
client<llm> OpenaiFallback {
  provider fallback
  options {
    // This will try the clients in order until one succeeds
    strategy [GPT41With2Retries, GPT41MiniWith2Retries]
  }
}

// Learn more about clients at https://docs.boundaryml.com/docs/snippets/clients/overview
client<llm> LocalQwen3 {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "qwen3-8b-mlx"
  }
}


client<llm> O4Mini {
  provider openai
  options {
    model "o4-mini-2025-04-16"
    api_key env.OPENAI_API_KEY
  }
}

client<llm> GPT41With2Retries {
  provider openai
  retry_policy Exponential
  options {
    model "gpt-4.1"
    api_key env.OPENAI_API_KEY
  }
}

client<llm> GPT41MiniWith2Retries {
  provider openai
  retry_policy Exponential
  options {
    model "gpt-4.1-mini"
    api_key env.OPENAI_API_KEY
  }
}

// https://docs.boundaryml.com/docs/snippets/clients/retry
retry_policy Exponential {
  max_retries 2
  // Strategy is optional
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 1.5
    max_delay_ms 10000
  }
}