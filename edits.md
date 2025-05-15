# Manual Estimate Editing Feature Implementation Plan

## Overview
This feature will allow users to directly edit estimate content in the UI, either through inline text editing or by using a directed chat interaction. Users can also add new line items or delete existing ones.

## UI/UX Requirements
1. **Hover Interaction**:
   - Editable areas will show a subtle highlight on hover
   - A pencil icon and chat icon will appear next to the hovered content
   - For line items, a delete icon (trash) will also appear
   
2. **Direct Editing Flow**:
   - Clicking on the editable area enables inline text editing
   - User can modify the text and save changes
   - Changes are applied immediately to the estimate
   
3. **Chat-Assisted Editing Flow**:
   - Clicking the chat icon opens the chat panel
   - Chat is prefilled with a template message: "For the [selected area] I want to make the following changes: "
   - The AI assistant can then apply changes through the patching mechanism
   
4. **Line Item Management**:
   - Delete button allows removal of a line item
   - "Add Line Item" button at the bottom of each section
   - Adding items presents a form with required fields
   - New items are assigned a unique UID

## Technical Implementation

### 1. Component Structure
- Create an `EditableEstimateItem` component that wraps each editable section
- Add hover state management using React hooks
- Implement conditional rendering of edit/chat/delete icons
- Create `AddLineItemButton` and `AddLineItemForm` components

### 2. Inline Editing
- Use controlled inputs or contentEditable for editing
- Track edited state and original values
- Implement save/cancel functionality
- Apply changes directly to the estimate data structure

### 3. Chat Integration
- Extend the existing chat panel functionality
- Add mechanism to identify what section is being edited
- Prefill chat with appropriate context about the selected area
- Update chat panel to maintain focus on the edited section

### 4. Data Management
- Implement optimistic UI updates for immediate feedback
- Create server action to persist changes to the database
- Use existing patch mechanism for efficient updates
- Handle validation and error cases
- Generate UIDs for new line items
- Implement deletion operations that maintain data integrity

### 5. User Feedback
- Add visual indicators for edit mode
- Show success/error notifications after edits
- Provide undo functionality for accidental changes

## Technical Considerations
- Ensure proper typing for all estimate data structures
- Use existing patching mechanism for efficiency
- Maintain UIDs for line items to ensure continuity
- Gracefully handle concurrent edits (optimistic UI + backend validation)
- Implement proper validation for added line items
- Ensure deleted items are properly removed from the database
- Consider impact of edits on estimate totals and dependencies

## Implementation Schedule
1. Create base components for editable areas
2. Implement hover styling and indicators
3. Add direct edit functionality
4. Integrate with chat for prefilled messages
5. Connect to data persistence layer
6. Test and refine user experience

## Potential Edge Cases
- Handle complex nested data structures in the estimate
- Account for validation requirements on edited content
- Consider undo/redo functionality for edit operations
- Plan for handling concurrent edits from multiple users