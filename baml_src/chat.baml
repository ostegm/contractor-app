
class BamlChatThread {
    events Event[]
}

class Event {
    type AllowedTypes
    data (UserInput | AssisantMessage | UpdateEstimateRequest | UpdateEstimateResponse)
}

// Event Types
enum AllowedTypes {
    UserInput
    AssisantMessage
    UpdateEstimateRequest
    UpdateEstimateResponse
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


function DetermineNextStep(thread: BamlChatThread, current_estimate: ConstructionProjectData) -> Event {
    client OpenaiFallback
    prompt #"
    You're a construction estimator working with a client. Help the client with any questions including updating the estimate as needed.
    Use the current estimate and the conversation history to determine the next step.

    <current_estimate>
    {{ current_estimate }}
    </current_estimate>

    <conversation_history>
    {% for event in thread.events %}
    <{{ event.type }}>
    {{ event.data }}
    </{{ event.type }}>
    {% endfor %}
    </conversation_history>
    {{ ctx.output_format }}
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