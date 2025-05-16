
class BamlChatThread {
    events Event[]
}

// All events (used for storing in DB an input thread)
class Event {
    type AllowedTypes
    data (UserInput | AssisantMessage | UpdateEstimateRequest | UpdateEstimateResponse | PatchEstimateRequest | PatchEstimateResponse)
}

// Response event (allowed output from the LLM)
class ResponseEvent {
    type AllowedTypes
    data (AssisantMessage | UpdateEstimateRequest | PatchEstimateRequest)
}

// Event Types
enum AllowedTypes {
    UserInput
    AssisantMessage
    UpdateEstimateRequest
    UpdateEstimateResponse
    PatchEstimateRequest
    PatchEstimateResponse
}

enum PatchOperation {
    Add
    Remove
    Replace
}

class UserInput {
    message string @description("The message from the user")
}

class AssisantMessage {
    message string @description("The message from the assistant")
}


class UpdateEstimateRequest {
    changes_to_make string @description("Detailed description of changes to make to the estimate")
}

class UpdateEstimateResponse {
    success bool @description("Whether the update was successful")
    error_message string @description("The error message if the update was not successful")
}

class Patch {
    json_path string @description("Path to the field being patched, e.g. /estimate_items/[uid]/cost_max or to replace a full line item /estimate_items/[uid] or to add a new line item to the end of the array /estimate_items/-")
    operation PatchOperation @description("Type of patch operation to perform")
    new_value string? | EstimateLineItem @description("Either a full estimate line item or a specific value to set (for Add or Replace operations on line item fields)")
}

class PatchEstimateRequest {
    patches Patch[] @description("List of patches to apply to the estimate")
}

class PatchResult {
    success bool @description("Whether the patch was successful")
    error_message string? @description("The error message if the patch was not successful")
}

class PatchEstimateResponse {
    patch_results PatchResult[] @description("Results of applying each patch")
}


function DetermineNextStep(thread: BamlChatThread, current_estimate: ConstructionProjectData?) -> ResponseEvent {
    client OpenaiFallback
    prompt #"
    You're a construction estimator working with a client. Help the client with any questions including updating the estimate as needed.
    Use the current estimate and the conversation history to determine the next step.

    {% if current_estimate %}
    <current_estimate>
    {{ current_estimate }}
    </current_estimate>
    {% endif %}

    <conversation_history>
    {% for event in thread.events %}
    <{{ event.type }}>
    {{ event.data }}
    </{{ event.type }}>
    {% endfor %}
    </conversation_history>

    ## Response Types
    You can respond in one of three ways:
    1. Return an AssisantMessage with a regular text response to the user
    2. Return a PatchEstimateRequest when the user requests a small numeric or textual change (≤5 items)
    3. Return an UpdateEstimateRequest when the change affects many items or requires recalculating totals

    ## Fast Patching Guidelines
    If the user requests a simple change like modifying a cost, description, or quantity of a specific line item, use PatchEstimateRequest with precise JSON patches.

    IMPORTANT: When referencing line items, use the line item's "uid" value directly in the json_path. Use this UID to target specific line items.

    Example - User: "Change the plumbing line item cost to $400"
    Response: PatchEstimateRequest with:
    ```
    {
      "patches": [
        {
          "json_path": "/estimate_items/plumb001/cost_range_min",
          "operation": "Replace",
          "new_value": "400"
        },
        {
          "json_path": "/estimate_items/plumb001/cost_range_max",
          "operation": "Replace",
          "new_value": "400"
        }
      ]
    }
    ```

    For more complex changes that would affect multiple items or require recalculating totals, use UpdateEstimateRequest with a description of the changes.

    {{ ctx.output_format }}
    "#

}


function ParseLineItem() -> EstimateLineItem {
    client OpenaiFallback
    prompt #"
        This is just a placeholder function used in typscript to parse line items returned inside PatchEstimateRequest.
    "#
}


test TestDetermineNextStep {
    functions [DetermineNextStep]
    args {
        thread {
            events [
                {
                    type "UserInput"
                    data {
                        message "Hello, how are you?"
                    }
                }
            ]
        }
    }
}