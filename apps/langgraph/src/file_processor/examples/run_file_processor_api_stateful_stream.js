#!/usr/bin/env node

/**
 * Example script to demonstrate how to use the file processor agent via streaming REST API
 * using the stateful approach (create assistant, create thread, run on thread with streaming).
 * 
 * This script:
 * 1. Creates an assistant (or uses an existing one)
 * 2. Creates a thread
 * 3. Reads a test image and encodes it as base64
 * 4. Creates the necessary input state with project information and files
 * 5. Runs the assistant on the thread with streaming
 * 6. Displays the results in real-time
 * 
 * Usage:
 * - Make sure you have Node.js installed
 * - Run: npm install node-fetch fs path eventsource
 * - Run: node run_file_processor_api_stateful_stream.js [port]
 *   (where [port] is optional and defaults to 59342)
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const EventSource = require('eventsource');

// Parse command line arguments
const args = process.argv.slice(2);
const port = args[0] || '59342'; // Use provided port or default to 59342

// Configuration
const API_BASE_URL = `http://localhost:${port}`;
const TEST_IMAGE_PATH = path.join(__dirname, '..', 'tests', 'testdata', 'dated-bathroom.png');

/**
 * Display the AI-generated estimate
 */
function displayEstimate(estimate) {
  console.log('\n--- AI-Generated Estimate ---\n');
  
  console.log(`Project Description: ${estimate.project_description}`);
  console.log(`Estimated Cost Range: $${estimate.estimated_total_min.toLocaleString()} - $${estimate.estimated_total_max.toLocaleString()}`);
  if (estimate.estimated_timeline_days) {
    console.log(`Estimated Timeline: ${estimate.estimated_timeline_days} days`);
  }
  console.log(`Overall Confidence Level: ${estimate.confidence_level}`);
  
  console.log('\n--- Key Considerations ---');
  estimate.key_considerations.forEach(item => {
    console.log(`• ${item}`);
  });
  
  console.log('\n--- Estimate Line Items ---');
  estimate.estimate_items.forEach(item => {
    console.log(`\n• ${item.description} (${item.category})`);
    console.log(`  Cost Range: $${item.cost_range_min.toLocaleString()} - $${item.cost_range_max.toLocaleString()}`);
    if (item.quantity && item.unit) {
      console.log(`  Quantity: ${item.quantity} ${item.unit}`);
    }
    if (item.confidence_score) {
      console.log(`  Confidence: ${item.confidence_score}`);
    }
    if (item.assumptions) {
      console.log(`  Assumptions: ${item.assumptions}`);
    }
  });
  
  console.log('\n--- Next Steps ---');
  estimate.next_steps.forEach(item => {
    console.log(`• ${item}`);
  });
  
  console.log('\n--- Missing Information ---');
  estimate.missing_information.forEach(item => {
    console.log(`• ${item}`);
  });
  
  console.log('\n--- Key Risks ---');
  estimate.key_risks.forEach(item => {
    console.log(`• ${item}`);
  });
  
  // Save the estimate to a JSON file
  fs.writeFileSync('construction_estimate_stateful_stream.json', JSON.stringify(estimate, null, 2));
  console.log('\nEstimate saved to construction_estimate_stateful_stream.json');
}

/**
 * Create an assistant or get an existing one
 */
async function createOrGetAssistant() {
  try {
    // First, try to search for existing assistants with graph_id = file_processor
    const searchResponse = await fetch(`${API_BASE_URL}/assistants/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        graph_id: 'file_processor'
      })
    });

    if (!searchResponse.ok) {
      throw new Error(`Failed to search assistants: ${searchResponse.status}`);
    }

    const assistants = await searchResponse.json();
    
    // If we found an existing assistant, use it
    if (assistants && assistants.length > 0) {
      console.log(`Using existing assistant: ${assistants[0].assistant_id}`);
      return assistants[0];
    }

    // Otherwise, create a new assistant
    console.log('Creating new assistant...');
    const createResponse = await fetch(`${API_BASE_URL}/assistants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        graph_id: 'file_processor',
        name: 'File Processor Assistant',
        metadata: {
          created_by: 'JavaScript Example'
        }
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create assistant: ${createResponse.status}`);
    }

    const assistant = await createResponse.json();
    console.log(`Created new assistant: ${assistant.assistant_id}`);
    return assistant;
  } catch (error) {
    console.error('Error creating/getting assistant:', error);
    throw error;
  }
}

/**
 * Create a new thread
 */
async function createThread() {
  try {
    const response = await fetch(`${API_BASE_URL}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metadata: {
          created_by: 'JavaScript Example',
          project: 'Bathroom Renovation'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.status}`);
    }

    const thread = await response.json();
    console.log(`Created new thread: ${thread.thread_id}`);
    return thread;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

/**
 * Run the assistant on a thread with streaming
 */
async function runAssistantOnThreadWithStreaming(assistantId, threadId, inputState) {
  try {
    // Create a run using the streaming endpoint
    const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant_id: assistantId,
        input: inputState,
        stream_mode: ['values', 'events'] // Request both values and events in the stream
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    // Get the response URL for the event stream
    const responseUrl = response.url;
    
    // Create an EventSource to listen to the stream
    const eventSource = new EventSource(responseUrl);
    
    // Store the final result
    let finalResult = null;
    
    // Return a promise that resolves when the stream ends
    return new Promise((resolve, reject) => {
      // Listen for messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Check if this is a values update
          if (data.event_type === 'values') {
            console.log('\n--- State Update ---');
            
            // If we have updated project info, print it
            if (data.data && data.data.updated_project_info) {
              console.log('\nUpdated Project Info:');
              console.log(data.data.updated_project_info);
            }
            
            // If we have an AI estimate, log that we received it
            if (data.data && data.data.ai_estimate) {
              console.log('\nReceived AI-generated estimate (will display at end)');
            }
            
            // Store the final result
            finalResult = data.data;
          } 
          // Check if this is a node execution event
          else if (data.event_type === 'node') {
            console.log(`\nExecuting node: ${data.node_name}`);
          }
          // Check if this is the end of the stream
          else if (data.event_type === 'end') {
            console.log('\n--- Processing Complete ---');
            eventSource.close();
            
            // Resolve the promise with the final result
            resolve(finalResult);
          }
        } catch (error) {
          console.error('Error parsing event data:', error);
          reject(error);
        }
      };
      
      // Handle errors
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        reject(error);
      };
    });
  } catch (error) {
    console.error('Error running assistant on thread with streaming:', error);
    throw error;
  }
}

/**
 * Main function to run the file processor agent
 */
async function main() {
  try {
    console.log('Processing files for bathroom renovation project...');
    console.log(`Using actual bathroom image from ${TEST_IMAGE_PATH}`);
    console.log(`Connecting to API server at ${API_BASE_URL}`);

    // Step 1: Create or get an assistant
    const assistant = await createOrGetAssistant();

    // Step 2: Create a thread
    const thread = await createThread();

    // Step 3: Read and encode the test image
    const imageContent = fs.readFileSync(TEST_IMAGE_PATH).toString('base64');

    // Step 4: Create the input state with project information and files
    const inputState = {
      project_info: '# Bathroom Renovation Project\n\nInitial consultation for bathroom renovation in a 1990s home.',
      files: [
        {
          type: 'text',
          name: 'client_notes.txt',
          content: 'Client wants a modern bathroom with a walk-in shower, double vanity, and heated floors. Budget is $15,000-$20,000. Timeline: would like to complete within 3 months.'
        },
        {
          type: 'image',
          name: 'current_bathroom.png',
          content: imageContent,
          description: 'Image shows a dated bathroom with beige tile, a shower/tub combo, single vanity with cultured marble top, and limited storage. The bathroom has oak cabinets and patterned floor tiles.'
        },
        {
          type: 'text',
          name: 'measurements.txt',
          content: 'Bathroom dimensions: 8ft x 10ft. Ceiling height: 8ft. Window on east wall. Plumbing on north and west walls.'
        }
      ],
      updated_project_info: ''
    };

    // Step 5: Run the assistant on the thread with streaming
    console.log(`Running assistant ${assistant.assistant_id} on thread ${thread.thread_id} with streaming...`);
    console.log('Streaming started. Waiting for updates...');
    
    const result = await runAssistantOnThreadWithStreaming(assistant.assistant_id, thread.thread_id, inputState);
    
    // Step 6: Print the final updated project information
    console.log('\n--- Final Updated Project Information ---\n');
    if (result && result.updated_project_info) {
      console.log(result.updated_project_info);
    } else {
      console.log('No updated project information found in the result');
    }
    
    // Step 7: Display the AI-generated estimate if available
    if (result && result.ai_estimate) {
      displayEstimate(result.ai_estimate);
    } else {
      console.log('\nNo AI-generated estimate found in the result');
    }
    
    console.log('\nThread ID for future reference:', thread.thread_id);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the main function
main(); 