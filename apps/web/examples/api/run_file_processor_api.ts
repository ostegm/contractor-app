#!/usr/bin/env ts-node

/**
 * Example script to demonstrate how to use the file processor agent via REST API.
 * 
 * This script:
 * 1. Reads a test image and encodes it as base64
 * 2. Creates the necessary input state with project information and files
 * 3. Calls the appropriate REST endpoint
 * 4. Displays the results
 * 
 * Usage:
 * - Make sure you have Node.js and TypeScript installed
 * - Run: npm install node-fetch fs path @types/node-fetch @types/node
 * - Run: npx ts-node run_file_processor_api.ts [port]
 *   (where [port] is optional and defaults to 59342)
 */

import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { ConstructionProjectData, InputFile } from '../../baml_client/baml_client/types';
import * as crypto from 'crypto';

// Parse command line arguments
const args = process.argv.slice(2);
const port = args[0] || '59342'; // Use provided port or default to 59342

// Configuration
const API_BASE_URL = `http://localhost:${port}`;
const TEST_IMAGE_PATH = path.join(__dirname, '../../../langgraph/tests/testdata/dated-bathroom.png');
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_POLLING_ATTEMPTS = 30; // Max attempts (e.g., 30 * 5s = 150 seconds timeout)

// Type definition for the expected run status object
interface RunStatus {
  run_id: string;
  thread_id: string;
  status: 'pending' | 'success' | 'error' | 'timeout' | 'interrupted' | string; // Allow other potential statuses
  error?: string; // Assuming error details might be here
  // Include other fields returned by the GET endpoint if known
}

// Define structure for the /join endpoint response
interface JoinResponse {
  updated_project_info: string;
  ai_estimate: ConstructionProjectData;
  // Include other fields from the /join response if needed (e.g., project_info, files)
}

/**
 * Polls the run status until it reaches a terminal state.
 */
async function pollRunStatus(threadId: string, runId: string): Promise<RunStatus> {
  let attempts = 0;
  while (attempts < MAX_POLLING_ATTEMPTS) {
    attempts++;
    console.log(`Polling attempt ${attempts}...`);

    const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs/${runId}`);
    
    if (!response.ok) {
      // Handle non-2xx responses during polling
      if (response.status === 404) {
        throw new Error(`Polling failed: Run ${runId} in thread ${threadId} not found (404).`);
      }
      const errorText = await response.text();
      throw new Error(`Polling request failed with status ${response.status}: ${errorText}`);
    }

    const runStatus = await response.json() as RunStatus;

    console.log(`Current status: ${runStatus.status}`);

    switch (runStatus.status) {
      case 'success':
        console.log('Run completed successfully.');
        return runStatus;
      case 'error':
      case 'timeout':
      case 'interrupted':
        console.error(`Run failed with status: ${runStatus.status}`);
        throw new Error(`Run failed or was interrupted. Status: ${runStatus.status}. ${runStatus.error || ''}`);
      case 'pending':
      default:
        // Still pending or unknown status, wait and poll again
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
        break;
    }
  }

  throw new Error(`Run polling timed out after ${MAX_POLLING_ATTEMPTS} attempts.`);
}

/**
 * Main function to run the file processor agent
 */
async function main() {
  try {
    console.log('Processing files for bathroom renovation project...');
    console.log(`Using actual bathroom image from ${TEST_IMAGE_PATH}`);
    console.log(`Connecting to API server at ${API_BASE_URL}`);

    // Read and encode the test image
    const imageContent = fs.readFileSync(TEST_IMAGE_PATH).toString('base64');

    // Create the input state with project information and files
    const files: InputFile[] = [
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
    ];

    // Create the thread first
    console.log('--- Creating thread ---');
    const createThreadResponse = await fetch(`${API_BASE_URL}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Body can be empty or include metadata/TTL if needed based on API docs
      body: JSON.stringify({})
    });

    if (!createThreadResponse.ok) {
      const errorText = await createThreadResponse.text();
      throw new Error(`Thread creation failed with status ${createThreadResponse.status}: ${errorText}`);
    }

    const threadResult = await createThreadResponse.json() as { thread_id: string; /* ... other fields like status, values */ };
    const threadId = threadResult.thread_id; // Use the ID returned by the server
    console.log(`Thread created successfully. Thread ID: ${threadId}`);

    const inputState = {
      project_info: '# Bathroom Renovation Project\n\nInitial consultation for bathroom renovation in a 1990s home.',
      files,
      updated_project_info: ''
    };

    // Call the API endpoint to create a background run
    console.log(`--- Creating background run ---`);
    const createResponse = await fetch(`${API_BASE_URL}/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant_id: 'file_processor',
        input: inputState
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`API request failed with status ${createResponse.status}: ${errorText}`);
    }

    const createResult = await createResponse.json() as { run_id: string; thread_id: string; /* ... other fields */ };
    const runId = createResult.run_id;
    console.log(`Run created successfully. Run ID: ${runId}`);

    console.log('\n--- Polling for run completion ---');

    // Poll until the run is in a terminal state
    const finalRunStatus = await pollRunStatus(threadId, runId);

    // Check if polling ended with success before joining
    if (finalRunStatus.status !== 'success') {
      // Error was already logged in pollRunStatus, just re-throw or handle
      throw new Error(`Run did not complete successfully. Final status: ${finalRunStatus.status}`);
    }

    // If successful, join the run to get the final output
    console.log('\n--- Joining run to fetch final output ---');
    const joinResponse = await fetch(`${API_BASE_URL}/threads/${threadId}/runs/${runId}/join`);

    if (!joinResponse.ok) {
        const errorText = await joinResponse.text();
        throw new Error(`Failed to join run. Status ${joinResponse.status}: ${errorText}`);
    }

    const result = await joinResponse.json() as JoinResponse;

    // --- The original result processing logic uses the 'result' from /join ---
    
    // Re-activate result processing
    console.log('\nRaw result from /join:', result); // Log the whole state for debugging

    // Print the updated project information
    console.log('\n--- Updated Project Information ---\n');
    console.log(result.updated_project_info);
    
    // Print the AI-generated estimate
    console.log('\n--- AI-Generated Estimate ---\n');
    
    const estimate = result.ai_estimate;
    
    console.log(`Project Description: ${estimate.project_description}`);
    console.log(`Estimated Cost Range: $${estimate.estimated_total_min?.toLocaleString() || 0} - $${estimate.estimated_total_max?.toLocaleString() || 0}`);
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
    fs.writeFileSync('construction_estimate_api.json', JSON.stringify(estimate, null, 2));
    console.log('\nEstimate saved to construction_estimate_api.json');
    

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error('An unknown error occurred:', error);
    }
  }
}

// Run the main function
main();