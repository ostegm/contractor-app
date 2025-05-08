# UI Changes Plan for Contractor Estimator App

This document outlines the planned UI/UX enhancements for the Contractor Estimator application, focusing on navigation reorganization and the introduction of a chat feature.

## 1. Global Changes: Top Bar Navigation

### Current State:
- Main navigation ("Projects", "Settings") is located in a collapsible left sidebar.
- "Logout" button is in the top bar.

### Proposed Changes:
- **Relocate Main Navigation:**
    - Move "Projects" link from the left sidebar to the main top bar.
    - Move "Settings" link from the left sidebar to the main top bar.
        - The "Settings" link should remain visually distinct (e.g., greyed out or styled as inactive) as it's not yet functional.
    - Position these links to the left of or adjacent to the existing "Logout" button in the top bar.
- **Visuals:**
    - Ensure the new top bar navigation items are clearly distinguishable and integrate seamlessly with the existing top bar design.

## 2. Left-Side Navigation (Sidebar) Reorganization

### Current State:
- The left sidebar contains "Projects", "Settings", "Chat", and potentially other items.
- A section for "Project Overview" and "Files" is present within the main view when a project is selected.

### Proposed Changes:
The left sidebar will be dedicated to project-specific navigation and chat functionalities, divided into two distinct sections.

**A. Project Navigation Section (Top):**
- This section will appear at the top of the sidebar.
- **"Estimate" Link:**
    - Clickable text: "Estimate".
    - Accompanied by a small, relevant icon (e.g., a document icon, calculator icon).
    - Clicking this will display the "Estimate Details" in the main view area.
- **"Files" Link:**
    - Clickable text: "Files".
    - Accompanied by a small, relevant icon (e.g., a folder icon).
    - Clicking this will display the project files management section in the main view area.
- This section should be visible when a project is active.

**B. Visual Divider:**
- A clear but subtle visual separator (e.g., a horizontal line) will be placed between the "Project Navigation" section and the "Chat" section.

**C. Chat Section (Bottom):**
- This section will appear below the visual divider.
- **"New Chat" Button:**
    - A clearly labeled button: "+ New Chat" or similar.
    - Styled consistently with the app's existing button design.
    - Clicking this will trigger the chat panel to open (see Section 4).
- **Chat History (Placeholder):**
    - Below the "New Chat" button, display placeholder text for chat history items.
    - Examples: "Initial Consultation Notes", "Follow-up on Measurements", "Material Queries".
    - These are purely for visual representation at this stage and will not be functional.
    - Clicking these placeholder items will eventually open the respective chat in the chat panel.

## 3. Main View Area Updates

### Current State:
- The main view for a project (estimate page) displays:
    - "Project Overview" section.
    - "Files" section (client_notes.txt, current_bathroom.png, measurements.txt).
    - "Estimate Overview" (cost, timeline, considerations).
    - "Estimate Details" (itemized list).

### Proposed Changes:

**A. When "Estimate" is selected in the (new) Left Sidebar Project Navigation:**
- **Remove "Project Overview":** The entire "Project Overview" section (description, confidence level, key considerations) will be removed from this view.
- **Remove "Files" section:** The "Files" list (client_notes.txt, etc.) will be removed from this view. It will now be accessible via the "Files" link in the sidebar.
- **Retain:**
    - "Estimated Cost Range" & "Estimated Timeline".
    - "Estimate Details" (itemized list).
    - The "Generate Estimate" button and related functionality should remain at the top right in both estimate and files modes.

**B. When "Files" is selected in the (new) Left Sidebar Project Navigation:**
- **Display Files Section:** The main view area will display the "Files" management section.
    - This section should be identical in content and functionality to the one currently shown on the estimate page (listing files like `client_notes.txt`, `current_bathroom.png`, `measurements.txt` with options to view/manage them).

## 4. Chat UI/UX

### Design Inspiration:
- **Shape and Feel:** Emulate the clean, user-friendly interface of ChatGPT (refer to provided screenshot).
- **Color Palette:** Adhere to the existing color patterns and styles of the Contractor Estimator app to ensure visual consistency.

### Chat Panel Behavior:
- **Activation:**
    - The chat panel slides out from the left side of the screen when:
        - The "New Chat" button is clicked.
        - An existing chat (placeholder) is clicked from the chat history in the sidebar.
- **Layout Impact:**
    - **Sidebar:** When the chat panel is open, the left-side navigation (Project Navigation and Chat sections) should visibly shrink in width to accommodate the chat panel. It should still be functional.
    - **Main View (Estimate/Files):** The main content area (e.g., "Estimate Details" or "Files" view) should remain visible to the right of the chat panel. It may resize slightly, but its content should not be obscured.
- **Chat Panel Components:**
    - **Header:** Display the current chat's title (e.g., "New Chat", or the name of an existing chat). May include a close (X) button or a "slide back" arrow to hide the chat panel.
    - **Message Area:** The main body where chat messages (user and AI/assistant) will be displayed. For now, this can be a static area or have placeholder messages.
    - **Input Box:**
        - A text input field for the user to type messages.
        - Positioned at the bottom of the chat panel.
        - Should remain visible and fixed at the bottom, even if the message area content scrolls.
        - Include a "Send" button (icon or text).

### Visuals:
- The chat panel should have a clear visual boundary.
- Use appropriate spacing and typography for readability within the chat.

## 5. Affected Files & New Components (Preliminary)

This is a high-level estimate and will require further code analysis.

### Likely Files to Modify:
- `apps/web/app/layout.tsx`: For changes to the main navigation structure (moving items to top bar) and incorporating the new sidebar layout.
- `apps/web/app/projects/[...]/page.tsx` (or equivalent project/estimate page component): For removing "Project Overview" and "Files" sections from the estimate view, and conditionally rendering content based on sidebar selection ("Estimate" vs. "Files").
- `apps/web/app/globals.css` (and other relevant CSS/styling files): For styling new elements, adjusting layouts.

### Potential New Components:
- `TopBarNavigation.tsx`: Component for the new navigation links in the top bar.
- `ProjectSidebar.tsx`: Component for the reorganized left sidebar, handling "Estimate", "Files" links, and the Chat section.
- `ChatPanel.tsx`: Component for the slide-out chat interface.
- `FilesView.tsx`: A dedicated component for the files section, to be shown when "Files" is clicked (if not already modular).

This plan will guide the development of the UI changes. Further details and refinements may occur during implementation. 