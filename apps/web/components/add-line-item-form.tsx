"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { v4 as uuidv4 } from "uuid"
import { EstimateLineItem } from "@/baml_client/baml_client/types"

interface AddLineItemFormProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (item: EstimateLineItem) => void
  category?: string
  subcategory?: string
}

export function AddLineItemForm({
  isOpen,
  onClose,
  onAdd,
  category = "",
  subcategory = ""
}: AddLineItemFormProps) {
  // Create a new item with default values
  const [item, setItem] = useState<EstimateLineItem>({
    uid: uuidv4(),
    description: "",
    category: category,
    subcategory: subcategory,
    quantity: 1,
    unit: "unit",
    cost_range_min: 0,
    cost_range_max: 0,
    notes: ""
  })

  // Handle form input changes
  const handleChange = (field: keyof EstimateLineItem, value: string | number) => {
    setItem(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onAdd(item)
    
    // Reset form to defaults
    setItem({
      uid: uuidv4(),
      description: "",
      category: category,
      subcategory: subcategory,
      quantity: 1,
      unit: "unit",
      cost_range_min: 0,
      cost_range_max: 0,
      notes: ""
    })
    
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle>Add New Line Item</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
              <Input
                id="description"
                value={item.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Item description"
                className="bg-gray-700 border-gray-600"
                required
              />
            </div>
            
            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category <span className="text-red-500">*</span></Label>
              <Input
                id="category"
                value={item.category}
                onChange={(e) => handleChange("category", e.target.value)}
                placeholder="e.g., Materials, Labor"
                className="bg-gray-700 border-gray-600"
                required
              />
            </div>
            
            {/* Subcategory */}
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Input
                id="subcategory"
                value={item.subcategory}
                onChange={(e) => handleChange("subcategory", e.target.value)}
                placeholder="e.g., Plumbing, Electrical"
                className="bg-gray-700 border-gray-600"
              />
            </div>
            
            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => handleChange("quantity", parseFloat(e.target.value) || 0)}
                  className="bg-gray-700 border-gray-600"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={item.unit}
                  onChange={(e) => handleChange("unit", e.target.value)}
                  placeholder="e.g., hours, sq.ft"
                  className="bg-gray-700 border-gray-600"
                />
              </div>
            </div>
            
            {/* Cost Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost_min">Min Cost ($) <span className="text-red-500">*</span></Label>
                <Input
                  id="cost_min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.cost_range_min}
                  onChange={(e) => handleChange("cost_range_min", parseFloat(e.target.value) || 0)}
                  className="bg-gray-700 border-gray-600"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost_max">Max Cost ($) <span className="text-red-500">*</span></Label>
                <Input
                  id="cost_max"
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.cost_range_max}
                  onChange={(e) => handleChange("cost_range_max", parseFloat(e.target.value) || 0)}
                  className="bg-gray-700 border-gray-600"
                  required
                />
              </div>
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={item.notes || ""}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Additional details or notes (supports markdown)"
                className="bg-gray-700 border-gray-600"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} className="border-gray-600 text-gray-300">
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!item.description || item.cost_range_min < 0 || item.cost_range_max < item.cost_range_min}
            >
              Add Line Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}