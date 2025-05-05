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



function ProcessProjectFiles(project_info: string, files: InputFile[], img: image?) -> string {
  client GeminiProcessor
  prompt #"
  You are an AI assistant specialized in analyzing construction project documents and media.
  Your task is to synthesize information from various sources (project descriptions, text files, image descriptions, audio transcriptions)
  and update the overall project assessment or information summary. Focus on extracting key details relevant to scope, materials, potential issues, or requirements mentioned in the files.

  Current Project Information:
  {{ project_info }}

  {{img}}

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

test TestProcessProjectFiles {
  functions [ProcessProjectFiles]
  args {
    project_info #"
      Customer wants to renovate an existing bathroom.
    "#
    files [
      {name "measurements.txt", type "text", description "measurements of the bathroom", content "10x10"},
      {name "existing_bathroom.jpg", type "image", description "existing bathroom", image_data {
        file "../apps/langgraph/tests/testdata/dated-bathroom.png"
      }},
    ]
  }
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


test TestGenerateProjectEstimate {
  functions [GenerateProjectEstimate]
  args {
    project_assessment #"
        **Project Assessment Update:**\n\nBased on the provided information, the bathroom renovation project involves updating an existing bathroom with the following details:\n\n*   **Project Goal:** Renovate an existing bathroom.\n*   **Dimensions:** The bathroom measures approximately 10x10 feet (assuming feet as the unit for typical room size).\n*   **Existing Condition & Features (from image):**\n    *   The bathroom appears to be a standard full bathroom containing a toilet, sink with vanity, and a bathtub/shower combination.\n    *   Materials visible include beige/tan square tiles on the walls (up to about chair rail height), wallpaper above the tile, a wood vanity cabinet with a light-colored countertop (possibly laminate or cultured marble), a mirrored medicine cabinet, and patterned vinyl or linoleum flooring.\n    *   Fixtures and finishes appear dated, consistent with a need for renovation.\n    *   A window with blinds and a ceiling ventilation fan are present.\n*   **Scope Implications:** The renovation likely includes replacing or updating floor and wall coverings, vanity, sink, toilet, and tub/shower components. The existing dated materials (tile, wallpaper, flooring, vanity) will likely require removal.\n*   **Potential Considerations (inferred):** Given the age suggested by the style, potential considerations include the condition of the subfloor and walls behind the existing finishes, the state of existing plumbing and electrical systems, and ensuring adequate ventilation.\n\nThis update incorporates the specific dimensions and visual details of the existing space derived from the provided files into the initial project description."
    "#
  }
}
