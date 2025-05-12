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
  type string // "mime_type"
  description string? // Optional description
  content string?     // Text content or transcription
  download_url string? // URL to download the file content
  image_data image? // Optional image data https://docs.boundaryml.com/ref/baml/types#image
  audio_data audio? // Optional audio data https://docs.boundaryml.com/ref/baml/types#audio
}

class VideoFrame {
  timestamp float @description("Timestamp of the frame in seconds")
  description string @description("Detailed description of the frame and its relevance to the project")
}

class ProcessedVideo {
  summary string @description("Summary of the video content with details about how each frame contributes to the project")
  frames VideoFrame[] @description("A list of frames that are cover all of the details from the video")
}

function GenerateProjectEstimate(files: InputFile[], existing_estimate: ConstructionProjectData?, requested_changes: string?) -> ConstructionProjectData {
  client OpenaiFallback
  prompt #"
  You are an AI assistant specialized in analyzing construction project documents and media.
  Your task is to synthesize information from various sources (text files, image descriptions, audio transcriptions)
  and generate a structured cost estimate for a construction project.
  Focus on extracting key details relevant to scope, materials, potential issues, or requirements mentioned in the files.

  <UserProvidedFiles>
  {% for file in files %}
  <file name={{ file.name }} type={{ file.type }} description={{ file.description }}>
  {% if file.image_data %}
  {{ file.image_data }}
  {% else %}
  {{ file.content }}
  {% endif %}
  </file>
  {% endfor %}
  </UserProvidedFiles>

  {% if existing_estimate %}
  <ExistingEstimate>
  {{ existing_estimate }}
  </ExistingEstimate>
  {% endif %}

  {% if requested_changes %}
  The user has requested the following changes to the existing estimate:
  <RequestedChanges>
  {{ requested_changes }}
  </RequestedChanges>
  {% endif %}

  Based *solely* on the provided information, generate a detailed estimate including a project description, total estimated cost, and a list of line items with their individual costs.
  Output the estimate as a JSON object conforming to the specified schema.

  {{ ctx.output_format }}
  "#
}

test TestGenerateProjectEstimate {
  functions [GenerateProjectEstimate]
  args {
    files [
      {name "measurements.txt", type "text", description "measurements of the bathroom", content "10x10"},
      {name "existing_bathroom.jpg", type "image", description "existing bathroom", image_data {
        file "../apps/langgraph/tests/testdata/dated-bathroom.png"
      }},
    ]
  }
}


function ProcessVideo(video: InputFile) -> ProcessedVideo {
  client GeminiProcessor
  prompt #"
    You're an expert construction estimator. You're given a video of a construction project.
    Your task is to review the video and provide a summary of the project.

   {{ ctx.output_format }}
  "#

}

function ProcessAudio(audio: InputFile) -> string {
  client GeminiProcessor
  prompt #"
    You're an expert construction estimator. You're given an audio file of a construction project.
    Your task is to review the audio and provide a transcription of the audio.

    <Audio>
    {{ audio.audio_data }}
    </Audio>

    Output the transcription as a string.

  "#
}

test TestProcessAudio {
  functions [ProcessAudio]
  args {
    audio {
      name "walkthrough_notes.m4a", type "audio", description "walkthrough notes", audio_data {
        file "../apps/web/supabase/storage_seed_files/contractor-app-dev/project2/walkthrough_notes.m4a"
      }
    }
  }
}