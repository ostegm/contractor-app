import { describe, it, expect } from 'vitest';
import {
  identifyPatchType,
  PatchOperationType,
  transformLineItemPropertyPatch,
  transformLineItemRemovalPatch,
  transformLineItemAdditionPatch,
  transformEstimatePropertyPatch,
  parseLineItemValue,
  applyEstimatePatch,
  applyEstimatePatches,
  calculateEstimateTotals
} from '../../lib/estimate-patch-utils';
import { type Patch } from '../../baml_client/baml_client/types';

// Sample estimate for testing
const sampleEstimate = {
  project_description: "Modern bathroom renovation in an 8x10 ft (1990s) home",
  estimated_total_min: 15000,
  estimated_total_max: 20000,
  estimated_timeline_days: 60,
  confidence_level: "Medium",
  estimate_items: [
    {
      uid: "demo001",
      description: "Demolition and removal of existing fixtures",
      category: "Demo",
      subcategory: "Full demo",
      cost_range_min: 1200,
      cost_range_max: 1800,
      unit: "sq ft",
      quantity: 80,
      confidence_score: "High"
    },
    {
      uid: "floor001",
      description: "Heated floor system",
      category: "Flooring",
      subcategory: "In-floor heating",
      cost_range_min: 1200,
      cost_range_max: 1600,
      unit: "sq ft",
      quantity: 80,
      confidence_score: "Medium"
    }
  ]
};

describe('identifyPatchType', () => {
  it('should identify line item property updates', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001/cost_range_min',
      operation: 'Replace',
      new_value: 1500
    };
    expect(identifyPatchType(patch)).toBe(PatchOperationType.LineItemPropertyUpdate);
  });

  it('should identify line item removals', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001',
      operation: 'Remove',
      new_value: undefined
    };
    expect(identifyPatchType(patch)).toBe(PatchOperationType.LineItemRemoval);
  });

  it('should identify line item additions', () => {
    const patch: Patch = {
      json_path: '/estimate_items',
      operation: 'Add',
      new_value: { description: 'New item' }
    };
    expect(identifyPatchType(patch)).toBe(PatchOperationType.LineItemAddition);
  });

  it('should identify estimate property updates', () => {
    const patch: Patch = {
      json_path: '/project_description',
      operation: 'Replace',
      new_value: 'Updated description'
    };
    expect(identifyPatchType(patch)).toBe(PatchOperationType.EstimatePropertyUpdate);
  });
});

describe('transformLineItemPropertyPatch', () => {
  it('should transform a line item property patch', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001/cost_range_min',
      operation: 'Replace',
      new_value: 1500
    };
    const operation = transformLineItemPropertyPatch(sampleEstimate, patch);
    expect(operation).toEqual({
      op: 'replace',
      path: '/estimate_items/0/cost_range_min',
      value: 1500
    });
  });

  it('should throw an error for non-existent UIDs', () => {
    const patch: Patch = {
      json_path: '/estimate_items/nonexistent/cost_range_min',
      operation: 'Replace',
      new_value: 1500
    };
    expect(() => transformLineItemPropertyPatch(sampleEstimate, patch)).toThrow();
  });
});

describe('transformLineItemRemovalPatch', () => {
  it('should transform a line item removal patch', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001',
      operation: 'Remove',
      new_value: undefined
    };
    const operation = transformLineItemRemovalPatch(sampleEstimate, patch);
    expect(operation).toEqual({
      op: 'remove',
      path: '/estimate_items/0'
    });
  });

  it('should throw an error for non-existent UIDs', () => {
    const patch: Patch = {
      json_path: '/estimate_items/nonexistent',
      operation: 'Remove',
      new_value: undefined
    };
    expect(() => transformLineItemRemovalPatch(sampleEstimate, patch)).toThrow();
  });
});

describe('parseLineItemValue', () => {
  it('should parse a valid JSON string', () => {
    const value = '{"uid":"test001","description":"New item","category":"Test","cost_range_min":1000,"cost_range_max":1500}';
    const result = parseLineItemValue(value);
    expect(result.description).toBe('New item');
    expect(result.cost_range_min).toBe(1000);
    expect(result.uid).toBe('test001');
  });

  it('should handle JavaScript object notation without quotes', () => {
    const value = '{uid: "test002", description: "New item", category: "Test", cost_range_min: 1000, cost_range_max: 1500}';
    const result = parseLineItemValue(value);
    expect(result.description).toBe('New item');
    expect(result.cost_range_min).toBe(1000);
    expect(result.uid).toBe('test002');
  });

  it('should handle unquoted values', () => {
    const value = '{uid: test003, description: New item, category: Test, cost_range_min: 1000, cost_range_max: 1500}';
    const result = parseLineItemValue(value);
    expect(result.description).toBe('New item');
    expect(result.category).toBe('Test');
    expect(result.cost_range_min).toBe(1000);
    expect(result.cost_range_max).toBe(1500);
    expect(result.uid).toBeDefined();
  });

  it('should pass through non-string values', () => {
    const value = { 
      uid: 'test004', 
      description: 'New item', 
      category: 'Test', 
      cost_range_min: 1000, 
      cost_range_max: 1500 
    };
    const result = parseLineItemValue(value);
    expect(result.description).toBe('New item');
    expect(result.cost_range_min).toBe(1000);
    expect(result.uid).toBe('test004');
  });
});

describe('transformLineItemAdditionPatch', () => {
  it('should transform a line item addition patch with an object value', () => {
    const patch: Patch = {
      json_path: '/estimate_items',
      operation: 'Add',
      new_value: { 
        uid: 'test005', 
        description: 'New item', 
        category: 'Test', 
        cost_range_min: 1000, 
        cost_range_max: 1500 
      }
    };
    const operation = transformLineItemAdditionPatch(sampleEstimate, patch);
    expect(operation).toMatchObject({
      op: 'add',
      path: '/estimate_items/-'
    });
    expect(operation?.value).toHaveProperty('description', 'New item');
    expect(operation?.value).toHaveProperty('cost_range_min', 1000);
    expect(operation?.value).toHaveProperty('uid', 'test005');
  });

  it('should transform a line item addition patch with a string value', () => {
    const patch: Patch = {
      json_path: '/estimate_items',
      operation: 'Add',
      new_value: '{"uid":"test006","description":"New item","category":"Test","cost_range_min":1000,"cost_range_max":1500}'
    };
    const operation = transformLineItemAdditionPatch(sampleEstimate, patch);
    expect(operation).toMatchObject({
      op: 'add',
      path: '/estimate_items/-'
    });
    expect(operation?.value).toHaveProperty('description', 'New item');
    expect(operation?.value).toHaveProperty('cost_range_min', 1000);
    expect(operation?.value).toHaveProperty('uid', 'test006');
  });

  it('should preserve existing UIDs', () => {
    const patch: Patch = {
      json_path: '/estimate_items',
      operation: 'Add',
      new_value: { 
        uid: 'custom123', 
        description: 'New item',
        category: 'Test',
        cost_range_min: 1000,
        cost_range_max: 1500
      }
    };
    const operation = transformLineItemAdditionPatch(sampleEstimate, patch);
    expect(operation?.value).toHaveProperty('uid', 'custom123');
  });
});

describe('transformEstimatePropertyPatch', () => {
  it('should transform an estimate property patch', () => {
    const patch: Patch = {
      json_path: '/project_description',
      operation: 'Replace',
      new_value: 'Updated description'
    };
    const operation = transformEstimatePropertyPatch(patch);
    expect(operation).toEqual({
      op: 'replace',
      path: '/project_description',
      value: 'Updated description'
    });
  });

  it('should handle remove operations', () => {
    const patch: Patch = {
      json_path: '/some_property',
      operation: 'Remove',
      new_value: undefined
    };
    const operation = transformEstimatePropertyPatch(patch);
    expect(operation).toEqual({
      op: 'remove',
      path: '/some_property'
    });
  });
});

describe('applyEstimatePatch', () => {
  it('should apply a line item property patch', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001/cost_range_min',
      operation: 'Replace',
      new_value: 1500
    };
    const { newEstimate, success } = applyEstimatePatch(sampleEstimate, patch);
    expect(success).toBe(true);
    expect(newEstimate.estimate_items[0].cost_range_min).toBe(1500);
  });

  it('should apply a line item removal patch', () => {
    const patch: Patch = {
      json_path: '/estimate_items/demo001',
      operation: 'Remove',
      new_value: undefined
    };
    const { newEstimate, success } = applyEstimatePatch(sampleEstimate, patch);
    expect(success).toBe(true);
    expect(newEstimate.estimate_items.length).toBe(1);
    expect(newEstimate.estimate_items[0].uid).toBe('floor001');
  });

  it('should apply a line item addition patch', () => {
    const patch: Patch = {
      json_path: '/estimate_items',
      operation: 'Add',
      new_value: { 
        uid: 'new001', 
        description: 'New item', 
        category: 'New', 
        cost_range_min: 1000,
        cost_range_max: 1500,
        unit: 'each',
        quantity: 1,
        confidence_score: 'Medium'
      }
    };
    const { newEstimate, success } = applyEstimatePatch(sampleEstimate, patch);
    expect(success).toBe(true);
    expect(newEstimate.estimate_items.length).toBe(3);
    expect(newEstimate.estimate_items[2].uid).toBe('new001');
  });

  it('should apply an estimate property patch', () => {
    const patch: Patch = {
      json_path: '/project_description',
      operation: 'Replace',
      new_value: 'Updated description'
    };
    const { newEstimate, success } = applyEstimatePatch(sampleEstimate, patch);
    expect(success).toBe(true);
    expect(newEstimate.project_description).toBe('Updated description');
  });

  it('should handle errors for invalid patches', () => {
    const patch: Patch = {
      json_path: '/estimate_items/nonexistent',
      operation: 'Remove',
      new_value: undefined
    };
    const { success, error } = applyEstimatePatch(sampleEstimate, patch);
    expect(success).toBe(false);
    expect(error).toBeDefined();
  });
});

describe('applyEstimatePatches', () => {
  it('should apply multiple patches', () => {
    const patches: Patch[] = [
      {
        json_path: '/estimate_items/demo001/cost_range_min',
        operation: 'Replace',
        new_value: 1500
      },
      {
        json_path: '/estimate_items',
        operation: 'Add',
        new_value: { 
          uid: 'new001', 
          description: 'New item', 
          category: 'New', 
          cost_range_min: 1000,
          cost_range_max: 1500,
          unit: 'each',
          quantity: 1,
          confidence_score: 'Medium'
        }
      },
      {
        json_path: '/project_description',
        operation: 'Replace',
        new_value: 'Updated description'
      }
    ];
    const { newEstimate, results } = applyEstimatePatches(sampleEstimate, patches);
    expect(results.every(r => r.success)).toBe(true);
    expect(newEstimate.estimate_items.length).toBe(3);
    expect(newEstimate.estimate_items[0].cost_range_min).toBe(1500);
    expect(newEstimate.estimate_items[2].uid).toBe('new001');
    expect(newEstimate.project_description).toBe('Updated description');
  });

  it('should continue applying patches after a failure', () => {
    const patches: Patch[] = [
      {
        json_path: '/estimate_items/nonexistent',
        operation: 'Remove',
        new_value: undefined
      },
      {
        json_path: '/project_description',
        operation: 'Replace',
        new_value: 'Updated description'
      }
    ];
    const { newEstimate, results } = applyEstimatePatches(sampleEstimate, patches);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
    expect(newEstimate.project_description).toBe('Updated description');
  });
});

describe('calculateEstimateTotals', () => {
  it('should calculate totals from line items', () => {
    // Create a custom estimate with EXACT values we expect in the test
    const testEstimate = {
      project_description: "Modern bathroom renovation in an 8x10 ft (1990s) home",
      estimate_items: [
        {
          uid: "demo001",
          cost_range_min: 1200,
          cost_range_max: 1800
        },
        {
          uid: "floor001",
          cost_range_min: 1200,
          cost_range_max: 1600
        }
      ],
      estimated_total_min: 0,
      estimated_total_max: 0
    };
    
    const updatedEstimate = calculateEstimateTotals(testEstimate);
    
    // These values should be calculated from the items above
    expect(updatedEstimate.estimated_total_min).toBe(2400);
    expect(updatedEstimate.estimated_total_max).toBe(3400);
  });

  it('should handle empty estimate_items', () => {
    const estimate = {
      ...sampleEstimate,
      estimate_items: [],
      estimated_total_min: 1000,
      estimated_total_max: 2000
    };
    const updatedEstimate = calculateEstimateTotals(estimate);
    expect(updatedEstimate.estimated_total_min).toBe(0);
    expect(updatedEstimate.estimated_total_max).toBe(0);
  });

  it('should handle missing estimate_items property', () => {
    const estimate = {
      project_description: 'Test',
      estimated_total_min: 1000,
      estimated_total_max: 2000
    };
    const updatedEstimate = calculateEstimateTotals(estimate);
    expect(updatedEstimate.estimated_total_min).toBe(0);
    expect(updatedEstimate.estimated_total_max).toBe(0);
  });
});