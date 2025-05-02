// BAML file: apps/langgraph/src/file_processor/baml_src/file_processor.baml

class EstimateLineItem {
  description string @description("Description of the work item or material")
  category string @description("Category of the item (e.g., Demo, Plumbing, Electrical, etc.)")
  subcategory string? @description("Subcategory for further classification")
  cost_range_min float @description("Minimum estimated cost in dollars")
  cost_range_max float @description("Maximum estimated cost in dollars")
  unit string? @description("Unit of measurement (e.g., hours, sq ft, linear ft)")
  quantity float? @description("Estimated quantity")
  assumptions string? @description("Key assumptions made for this line item")
  confidence_score string? @description("Confidence in the estimate based on the information provided: (High, Medium, Low)")
  notes string? @description("Additional notes or details")
}

class ConstructionProjectData {
  project_description string @description("Brief summary of the project scope")
  estimated_total_min float? @description("Minimum total estimated cost")
  estimated_total_max float? @description("Maximum total estimated cost")
  estimated_timeline_days int? @description("Estimated project duration in days")
  key_considerations string[] @description("List of key considerations for this project")
  confidence_level string @description("Overall confidence level in the estimate (High, Medium, Low)")
  estimate_items EstimateLineItem[] @description("Line items for the estimate")
  next_steps string[] @description("Prioritized next steps for the contractor")
  missing_information string[] @description("Information needed to improve estimate accuracy")
  key_risks string[] @description("List of key risks or potential complications")
}

class InputFile {
  name string
  type string // "image", "video", "audio", "text"
  description string? // Optional description
  content string?     // Text content or transcription
  download_url string? // URL to download the file content\
  image_data image? // Optional image data https://docs.boundaryml.com/ref/baml/types#image
}



function ProcessProjectFiles(project_info: string, files: InputFile[]) -> string {
  client GeminiProcessor
  prompt #"
  You are an AI assistant specialized in analyzing construction project documents and media.
  Your task is to synthesize information from various sources (project descriptions, text files, image descriptions, audio transcriptions)
  and update the overall project assessment or information summary. Focus on extracting key details relevant to scope, materials, potential issues, or requirements mentioned in the files.

  Current Project Information:
  {{ project_info }}

  Provided Files:
  {% for file in files %}
  <file name={{ file.name }} type={{ file.type }} description={{ file.description }}>
  {% if file.type == "image" %}
  {{ file.image_data }}
  {% else %}
  {{ file.content }}
  {% endif %}
  </file>
  {% endfor %}

  Based on all the provided information (current project info and the files), update and refine the project assessment.
  Generate a comprehensive summary that incorporates the new findings from the files. If the initial project info is empty or minimal, create the assessment based solely on the files.
  "#
}

function GenerateProjectEstimate(project_assessment: string) -> ConstructionProjectData {
  client OpenaiFallback
  prompt #"
  You are an AI assistant tasked with generating a structured cost estimate for a construction project based on its assessment.
  Output the estimate as a JSON object conforming to the specified schema.

  Project Assessment:
  {{ project_assessment }}

  Generate a detailed estimate including a project name, total estimated cost, and a list of line items with their individual costs.
  Adhere strictly to the following format:
  {{ ctx.output_format }}
  "#
}