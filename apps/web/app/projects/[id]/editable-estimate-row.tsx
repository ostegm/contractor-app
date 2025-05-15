"use client"

import React from "react"
import { EstimateLineItem } from "@/baml_client/baml_client/types"
import { EditableEstimateItem } from "../../../components/editable-estimate-item"
import ReactMarkdown from "react-markdown"
import { updateEstimateField, deleteEstimateLineItem } from "./editable-actions"

interface EditableEstimateRowProps {
  item: EstimateLineItem
  isPatched: boolean
  projectId: string
  onUpdate: () => void
}

export function EditableEstimateRow({ item, isPatched, projectId, onUpdate }: EditableEstimateRowProps) {
  return (
    <tr className={`hover:bg-gray-700/20 ${isPatched ? 'flash-highlight' : ''}`}>
      <td className="py-3 pr-4">
        <div className="font-medium text-gray-200">
          <EditableEstimateItem
            value={item.description}
            fieldPath={`estimate_items.${item.uid}.description`}
            onEdit={async (value) => {
              const result = await updateEstimateField(projectId, `estimate_items.${item.uid}.description`, value);
              if (result.success) {
                onUpdate();
                return true;
              }
              return false;
            }}
          >
            {item.description}
          </EditableEstimateItem>
        </div>
        {item.notes && (
          <div className="text-xs text-gray-400 mt-1 prose prose-xs prose-invert max-w-none">
            <EditableEstimateItem
              value={item.notes}
              fieldPath={`estimate_items.${item.uid}.notes`}
              isMarkdown={true}
              onEdit={async (value) => {
                const result = await updateEstimateField(projectId, `estimate_items.${item.uid}.notes`, value);
                if (result.success) {
                  onUpdate();
                  return true;
                }
                return false;
              }}
            >
              <ReactMarkdown>{item.notes}</ReactMarkdown>
            </EditableEstimateItem>
          </div>
        )}
      </td>
      <td className="py-3 text-gray-400">
        <EditableEstimateItem
          value={item.category}
          fieldPath={`estimate_items.${item.uid}.category`}
          onEdit={async (value) => {
            const result = await updateEstimateField(projectId, `estimate_items.${item.uid}.category`, value);
            if (result.success) {
              onUpdate();
              return true;
            }
            return false;
          }}
        >
          {item.category}
        </EditableEstimateItem>
        {item.subcategory && (
          <span className="text-xs block text-gray-500">
            <EditableEstimateItem
              value={item.subcategory}
              fieldPath={`estimate_items.${item.uid}.subcategory`}
              onEdit={async (value) => {
                const result = await updateEstimateField(projectId, `estimate_items.${item.uid}.subcategory`, value);
                if (result.success) {
                  onUpdate();
                  return true;
                }
                return false;
              }}
            >
              {item.subcategory}
            </EditableEstimateItem>
          </span>
        )}
      </td>
      <td className="py-3 text-right text-gray-300">
        <EditableEstimateItem
          value={item.quantity || 0}
          fieldPath={`estimate_items.${item.uid}.quantity`}
          onEdit={async (value) => {
            const numValue = parseFloat(value);
            if (isNaN(numValue) || numValue < 0) return false;
            const result = await updateEstimateField(projectId, `estimate_items.${item.uid}.quantity`, numValue);
            if (result.success) {
              onUpdate();
              return true;
            }
            return false;
          }}
        >
          {item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}
        </EditableEstimateItem>
      </td>
      <td className="py-3 text-right font-medium text-green-400">
        <EditableEstimateItem
          value={`${item.cost_range_min} - ${item.cost_range_max}`}
          fieldPath={`estimate_items.${item.uid}.cost_range`}
          onEdit={async (value) => {
            const parts = value.split('-').map(p => p.trim().replace(/[^0-9.]/g, ''));
            if (parts.length !== 2) return false;
            
            const min = parseFloat(parts[0]);
            const max = parseFloat(parts[1]);
            
            if (isNaN(min) || isNaN(max) || min < 0 || max < min) return false;
            
            const minResult = await updateEstimateField(projectId, `estimate_items.${item.uid}.cost_range_min`, min);
            const maxResult = await updateEstimateField(projectId, `estimate_items.${item.uid}.cost_range_max`, max);
            
            if (minResult.success && maxResult.success) {
              onUpdate();
              return true;
            }
            return false;
          }}
          canDelete={true}
          onDelete={async () => {
            if (confirm(`Are you sure you want to delete the "${item.description}" line item?`)) {
              const result = await deleteEstimateLineItem(projectId, item.uid);
              if (result.success) {
                onUpdate();
                return true;
              }
              return false;
            }
            return false;
          }}
        >
          ${item.cost_range_min.toLocaleString()} - ${item.cost_range_max.toLocaleString()}
        </EditableEstimateItem>
      </td>
    </tr>
  )
}