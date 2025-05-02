// Sample BAML schema for Contractor project

// Define the types used in the application
class ContractorEstimate {
    project_name string
    description string 
    total_cost float
    line_items LineItem[]
    estimated_hours float
    timeline TimelineInfo
}

class LineItem {
    description string
    cost float
    quantity int
}

class TimelineInfo {
    start_date string
    end_date string
    milestones Milestone[]
}

class Milestone {
    name string
    date string
    completion_percentage float
}

// Define a simple function to generate project estimates
function GenerateEstimate(
    project_name: string,
    description: string,
    requirements: string[]
) -> ContractorEstimate {
    client OpenaiFallback
    prompt #"
    You are an expert construction estimator. Based on the project information provided,
    generate a detailed estimate including costs, timeline, and milestones.

    Project Name: {{ project_name }}
    Description: {{ description }}
    Requirements:
    {% for requirement in requirements %}
    - {{ requirement }}
    {% endfor %}

    Provide a detailed estimate with the following:
    1. Line items for materials and labor
    2. Total cost
    3. Timeline with start and end dates
    4. Key milestones with completion percentages

    Format your response according to the specified output format.
    {{ ctx.output_format }}
    "#
}

// Example test case for the function
test generate_basic_estimate {
    functions [GenerateEstimate]
    args {
        project_name "Bathroom Renovation"
        description "Complete renovation of a 100 sq ft bathroom"
        requirements [
            "Replace bathtub with walk-in shower",
            "Install new vanity and toilet",
            "Replace flooring with ceramic tile",
            "Update lighting fixtures"
        ]
    }
}