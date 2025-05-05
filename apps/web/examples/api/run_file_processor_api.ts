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

// Parse command line arguments
const args = process.argv.slice(2);
const port = args[0] || '59342'; // Use provided port or default to 59342

// Configuration
const API_BASE_URL = `http://localhost:${port}`;
const TEST_IMAGE_PATH = path.join(__dirname, '../../../langgraph/tests/testdata/dated-bathroom.png');

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

    const inputState = {
      project_info: '# Bathroom Renovation Project\n\nInitial consultation for bathroom renovation in a 1990s home.',
      files,
      updated_project_info: ''
    };

    // Call the API endpoint
    const response = await fetch(`${API_BASE_URL}/runs/wait`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistant_id: 'file_processor',
        input: inputState
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const result = await response.json() as {
      updated_project_info: string;
      ai_estimate: ConstructionProjectData;
    };
    
    console.log('Raw result:', result);

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