generator ts_client {
  output_type        "typescript/react"
  output_dir         "../apps/web/baml_client"
  version            "0.86.1"
  default_client_mode async
}

generator py_client {
  output_type        "python/pydantic"
  output_dir         "../apps/langgraph/src/file_processor"
  version            "0.86.1"
  default_client_mode sync
}