
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


function DetermineNextStep(thread: BamlChatThread) -> Event {
    client OpenaiFallback
    prompt #"
    You are a helpful assistant that is given a list of events.
    You need to determine the next step in the conversation.

    Here's a conversation history:
    {% for event in thread.events %}
    <{{ event.type }}>
    {{ event.data }}
    </{{ event.type }}>
    {% endfor %}

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