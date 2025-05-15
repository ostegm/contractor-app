'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { apply as applyJsonPatch } from 'json-patch'
import { v4 as uuidv4 } from "uuid"
import { 
  AIEstimate, 
  EstimateItem,
  updateProjectEstimate
} from './actions'

/**
 * Update a single field in the estimate
 */
export async function updateEstimateField(
  projectId: string,
  path: string,
  value: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Fetch current estimate from the database
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('ai_estimate')
      .eq('id', projectId)
      .single()
    
    if (fetchError) {
      console.error('Error fetching project estimate:', fetchError)
      return { success: false, error: 'Failed to fetch current estimate' }
    }
    
    if (!project?.ai_estimate) {
      return { success: false, error: 'No estimate exists to update' }
    }
    
    // Parse the current estimate
    let currentEstimate: AIEstimate
    try {
      if (typeof project.ai_estimate === 'string') {
        currentEstimate = JSON.parse(project.ai_estimate)
      } else {
        currentEstimate = project.ai_estimate
      }
    } catch (parseError) {
      console.error('Error parsing estimate JSON:', parseError)
      return { success: false, error: 'Failed to parse estimate data' }
    }
    
    // Handle special case for estimate_items with uid
    let patchPath = '';
    const uidMatch = path.match(/estimate_items\.([\w-]+)\.(.+)/);
    
    if (uidMatch) {
      // Find the index of the item with the matching UID
      const uid = uidMatch[1];
      const field = uidMatch[2];
      const itemIndex = currentEstimate.estimate_items.findIndex(item => item.uid === uid);
      
      if (itemIndex === -1) {
        return { success: false, error: `Item with UID ${uid} not found` };
      }
      
      patchPath = `/estimate_items/${itemIndex}/${field}`;
    } else {
      // Regular path conversion
      patchPath = `/${path.replace(/\./g, '/')}`;
    }
    
    // Create a JSON patch operation
    const patch = [{ 
      op: 'replace', 
      path: patchPath, 
      value 
    }]
    
    // Apply the patch
    try {
      const updatedEstimate = applyJsonPatch(currentEstimate, patch)
      
      // Update the estimate in the database
      return updateProjectEstimate(projectId, updatedEstimate)
    } catch (patchError) {
      console.error('Error applying patch to estimate:', patchError)
      return { success: false, error: 'Failed to update field in estimate' }
    }
  } catch (error) {
    console.error('Error in updateEstimateField:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }
  }
}

/**
 * Delete a line item from the estimate
 */
export async function deleteEstimateLineItem(
  projectId: string,
  itemUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Fetch current estimate from the database
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('ai_estimate')
      .eq('id', projectId)
      .single()
    
    if (fetchError) {
      console.error('Error fetching project estimate:', fetchError)
      return { success: false, error: 'Failed to fetch current estimate' }
    }
    
    if (!project?.ai_estimate) {
      return { success: false, error: 'No estimate exists to update' }
    }
    
    // Parse the current estimate
    let currentEstimate: AIEstimate
    try {
      if (typeof project.ai_estimate === 'string') {
        currentEstimate = JSON.parse(project.ai_estimate)
      } else {
        currentEstimate = project.ai_estimate
      }
    } catch (parseError) {
      console.error('Error parsing estimate JSON:', parseError)
      return { success: false, error: 'Failed to parse estimate data' }
    }
    
    // Check if estimate_items exists and is an array
    if (!Array.isArray(currentEstimate.estimate_items)) {
      return { success: false, error: 'Estimate does not contain line items' }
    }
    
    // Filter out the item with the matching UID
    const filteredItems = currentEstimate.estimate_items.filter(item => item.uid !== itemUid)
    
    // If the length is the same, the item wasn't found
    if (filteredItems.length === currentEstimate.estimate_items.length) {
      return { success: false, error: 'Line item not found' }
    }
    
    // Update the estimate with the filtered items
    const updatedEstimate = {
      ...currentEstimate,
      estimate_items: filteredItems
    }
    
    // Recalculate totals
    let totalMin = 0
    let totalMax = 0
    filteredItems.forEach(item => {
      totalMin += item.cost_range_min || 0
      totalMax += item.cost_range_max || 0
    })
    updatedEstimate.estimated_total_min = totalMin
    updatedEstimate.estimated_total_max = totalMax
    
    // Update the estimate in the database
    return updateProjectEstimate(projectId, updatedEstimate)
  } catch (error) {
    console.error('Error in deleteEstimateLineItem:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }
  }
}

/**
 * Add a new line item to the estimate
 */
export async function addEstimateLineItem(
  projectId: string,
  newItem: EstimateItem
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Fetch current estimate from the database
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('ai_estimate')
      .eq('id', projectId)
      .single()
    
    if (fetchError) {
      console.error('Error fetching project estimate:', fetchError)
      return { success: false, error: 'Failed to fetch current estimate' }
    }
    
    if (!project?.ai_estimate) {
      return { success: false, error: 'No estimate exists to update' }
    }
    
    // Parse the current estimate
    let currentEstimate: AIEstimate
    try {
      if (typeof project.ai_estimate === 'string') {
        currentEstimate = JSON.parse(project.ai_estimate)
      } else {
        currentEstimate = project.ai_estimate
      }
    } catch (parseError) {
      console.error('Error parsing estimate JSON:', parseError)
      return { success: false, error: 'Failed to parse estimate data' }
    }
    
    // Check if estimate_items exists
    if (!currentEstimate.estimate_items) {
      currentEstimate.estimate_items = []
    }
    
    // Ensure new item has a UID
    if (!newItem.uid) {
      newItem.uid = uuidv4()
    }
    
    // Add the new item to the estimate
    const updatedItems = [...currentEstimate.estimate_items, newItem]
    const updatedEstimate = {
      ...currentEstimate,
      estimate_items: updatedItems
    }
    
    // Recalculate totals
    let totalMin = 0
    let totalMax = 0
    updatedItems.forEach(item => {
      totalMin += item.cost_range_min || 0
      totalMax += item.cost_range_max || 0
    })
    updatedEstimate.estimated_total_min = totalMin
    updatedEstimate.estimated_total_max = totalMax
    
    // Update the estimate in the database
    return updateProjectEstimate(projectId, updatedEstimate)
  } catch (error) {
    console.error('Error in addEstimateLineItem:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }
  }
}