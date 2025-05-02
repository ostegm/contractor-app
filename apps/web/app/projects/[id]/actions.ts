'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

if (!process.env.SUPABASE_STORAGE_BUCKET) {
  throw new Error('Missing SUPABASE_STORAGE_BUCKET environment variable')
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET
const LANGGRAPH_API_URL = process.env.LANGGRAPH_API_URL
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY


function sanitizeFileName(fileName: string): string {
  // Replace spaces and special characters with underscores
  // Remove any characters that aren't alphanumeric, underscores, dots, or dashes
  const name = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Ensure the name is unique by adding a timestamp
  const timestamp = Date.now()
  const ext = name.split('.').pop()
  const baseName = name.split('.').slice(0, -1).join('.')
  return `${baseName}_${timestamp}.${ext}`
}



export async function uploadFile(formData: FormData, projectId: string) {
  const supabase = await createClient()
  
  try {
    const file = formData.get('file') as File
    const description = formData.get('description') as string

    if (!file) {
      return { error: 'No file provided' }
    }

    if (!description) {
      return { error: 'File description is required' }
    }

    // Check file size
    const fileSizeInMB = file.size / (1024 * 1024)
    if (fileSizeInMB > 8) {
      return { error: `File size exceeds 8MB limit (${fileSizeInMB.toFixed(2)}MB)` }
    }

    const sanitizedFileName = sanitizeFileName(file.name)
    const filePath = `${projectId}/${sanitizedFileName}`

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file)

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return { error: `Failed to upload file: ${uploadError.message}` }
    }



    console.log(`File path: ${filePath}`);

    // Try to insert with description and file path
    const { error: dbError } = await supabase
      .from('files')
      .insert({
        project_id: projectId,
        file_name: file.name,

        file_url: filePath,
        description: description,
      })

    // Check if the database insertion failed
    if (dbError) {
      console.error('Error inserting file record into database:', dbError)
      // Optional: Attempt to delete the orphaned file from storage?
      // await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return { error: `Failed to save file record to database: ${dbError.message}` }
    }
      
    return { success: true, filePath, bucket: STORAGE_BUCKET }
  } catch (error) {
    console.error('Unexpected error during file upload:', error)
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}

interface FileToProcess {
  type: string;
  name: string;
  content?: string;
  description: string;
  error?: string;
  path?: string;
  bucket?: string;
}

// Define the AI estimate interface based on the provided JSON structure
export interface EstimateItem {
  description: string;
  category: string;
  subcategory?: string | null;
  cost_range_min: number;
  cost_range_max: number;
  unit?: string | null;
  quantity?: number;
  assumptions?: string;
  confidence_score?: string;
  notes?: string;
}

export interface AIEstimate {
  project_description: string;
  estimated_total_min: number;
  estimated_total_max: number;
  estimated_timeline_days?: number;
  key_considerations: string[];
  confidence_level: string;
  estimate_items: EstimateItem[];
  next_steps: string[];
  missing_information: string[];
  key_risks: string[];
}

export async function processFiles(projectId: string, files: FileToProcess[]) {
  try {
    // Get project info from database
    const supabase = await createClient()
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError) {
      console.error('Error fetching project:', projectError)
      return { error: 'Failed to fetch project information' }
    }

    // Process files to load their content
    const processedFiles: FileToProcess[] = await Promise.all(files.map(async (file) => {
      try {
        // For images and text files, use Supabase's signed URLs
        if ((file.type === 'image' || file.type === 'text') && file.path) {
          console.log(`Processing ${file.type} file: ${file.name} with path: ${file.path}`);
          
          // Create a signed URL for the file
          const bucket = file.bucket || STORAGE_BUCKET;
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from(bucket)
            .createSignedUrl(file.path, 3600); // 1 hour expiration
          
          if (signedUrlError) {
            console.error(`Error creating signed URL for file ${file.name}:`, signedUrlError);
            return {
              ...file,
              content: '',
              error: `Failed to create signed URL: ${signedUrlError.message}`
            };
          }
          
          // Fetch the content using the signed URL
          const response = await fetch(signedUrlData.signedUrl);
          if (!response.ok) {
            console.error(`Error fetching file ${file.name}: ${response.status} ${response.statusText}`);
            return {
              ...file,
              content: '',
              error: `Failed to fetch file: ${response.status} ${response.statusText}`
            };
          }
          
          if (file.type === 'image') {
            // Convert the response to base64 for images
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            
            return {
              ...file,
              content: base64
            };
          } else {
            // Convert the response to text for text files
            const content = await response.text();
            
            return {
              ...file,
              content
            };
          }
        }
        
        // For other file types, just pass through
        return file;
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return {
          ...file,
          content: '',
          error: error instanceof Error ? error.message : 'Unknown error processing file'
        };
      }
    }));

    // Check if any files failed to load their content
    const failedFiles = processedFiles.filter(file => 
      (file.type === 'image' && !file.content && file.error) || 
      (file.type === 'text' && !file.content && file.error)
    );

    if (failedFiles.length > 0) {
      const failedFileNames = failedFiles.map(f => f.name).join(', ');
      const errors = failedFiles.map(f => `${f.name}: ${f.error}`).join('\n');
      console.error('Failed to fetch content for files:', errors);
      return { 
        error: `Failed to fetch content for ${failedFiles.length} file(s): ${failedFileNames}. Please check the file URLs and try again.`,
        failedFiles
      };
    }

    // Create the input state with project information and files
    const inputState: {
      project_info: string;
      files: FileToProcess[];
      updated_project_info: string;
    } = {
      project_info: project.project_info || `# ${project.name}\n\n${project.description}`,
      files: processedFiles,
      updated_project_info: ''
    }

    console.log('Calling LangGraph API at:', LANGGRAPH_API_URL);
    
    // Call the LangGraph API
    const response = await fetch(`${LANGGRAPH_API_URL}/runs/wait`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LANGGRAPH_API_KEY!,
      },
      body: JSON.stringify({
        assistant_id: 'file_processor',
        input: inputState
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed with status ${response.status}: ${errorText}`)
    }

    const result = await response.json()
    // console.log('LangGraph API response:', JSON.stringify(result, null, 2));
    
    // Extract the updated project info from the response
    let updatedProjectInfo = '';
    
    if (result.updated_project_info) {
      // Direct property - this is the format we're seeing in the logs
      updatedProjectInfo = result.updated_project_info;
    } else if (result.values && result.values.updated_project_info) {
      // Alternative format with values property
      updatedProjectInfo = result.values.updated_project_info;
    } else if (result.output && result.output.updated_project_info) {
      // Alternative format with output property
      updatedProjectInfo = result.output.updated_project_info;
    } else if (typeof result === 'string') {
      // Plain string response
      updatedProjectInfo = result;
    } else {
      // Fallback: generate a simple markdown from the input
      console.warn('Could not find updated_project_info in the response, using fallback');
      updatedProjectInfo = `# ${project.name}\n\n${project.description}\n\n## Files\n\n${
        files.map(file => `- ${file.name}: ${file.description}`).join('\n')
      }`;
    }
    
    // Extract the AI estimate from the response
    let aiEstimate: AIEstimate | null = null;
    
    if (result.ai_estimate) {
      // Direct property
      aiEstimate = result.ai_estimate;
    } else if (result.values && result.values.ai_estimate) {
      // Alternative format with values property
      aiEstimate = result.values.ai_estimate;
    } else if (result.output && result.output.ai_estimate) {
      // Alternative format with output property
      aiEstimate = result.output.ai_estimate;
    }
    
    // If we have an estimate, store it in the database
    if (aiEstimate) {
      try {
        // Store the estimate as a JSON string in the database
        await updateProjectEstimate(projectId, aiEstimate);
      } catch (error) {
        console.error('Error storing AI estimate:', error);
        // Continue even if storing the estimate fails
      }
    }
    
    // Return the updated project information and AI estimate
    return { 
      success: true, 
      updated_project_info: updatedProjectInfo,
      ai_estimate: aiEstimate
    }
  } catch (error) {
    console.error('Error processing files:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function updateProjectEstimate(projectId: string, estimate: AIEstimate) {
  try {
    const supabase = await createClient()
    
    // Convert the estimate to a JSON string
    const estimateJson = JSON.stringify(estimate)
    
    // Try to update with ai_estimate
    const { error } = await supabase
      .from('projects')
      .update({ ai_estimate: estimateJson })
      .eq('id', projectId)

    // If there's an error with the ai_estimate column, log it
    if (error && error.message.includes("Could not find the 'ai_estimate' column")) {
      console.warn('ai_estimate column not found in projects table. Please run the database migration.')
      return { 
        error: 'AI estimate could not be saved to the database. Database schema needs to be updated.',
        ai_estimate: estimate // Still return the generated estimate for display
      }
    } else if (error) {
      console.error('Error updating AI estimate:', error)
      return { error: 'Failed to update AI estimate' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating AI estimate:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function updateProjectInfo(projectId: string, projectInfo: string) {
  try {
    const supabase = await createClient()
    
    // Try to update with project_info first
    const { error } = await supabase
      .from('projects')
      .update({ project_info: projectInfo })
      .eq('id', projectId)

    // If there's an error with the project_info column, log it
    if (error && error.message.includes("Could not find the 'project_info' column")) {
      console.warn('Project_info column not found in projects table. Please run the database migration.')
      return { 
        error: 'Project information could not be saved to the database. Database schema needs to be updated.',
        updated_project_info: projectInfo // Still return the generated info for display
      }
    } else if (error) {
      console.error('Error updating project info:', error)
      return { error: 'Failed to update project information' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating project info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function clearProjectInfo(projectId: string) {
  try {
    const supabase = await createClient()
    
    // Update project_info to empty string
    const { error } = await supabase
      .from('projects')
      .update({ project_info: '' })
      .eq('id', projectId)

    if (error) {
      console.error('Error clearing project info:', error)
      return { error: 'Failed to clear project information' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error clearing project info:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export async function clearProjectEstimate(projectId: string) {
  try {
    const supabase = await createClient()
    
    // Update ai_estimate to empty string
    const { error } = await supabase
      .from('projects')
      .update({ ai_estimate: null })
      .eq('id', projectId)

    if (error) {
      console.error('Error clearing project estimate:', error)
      return { error: 'Failed to clear project estimate' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error clearing project estimate:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

