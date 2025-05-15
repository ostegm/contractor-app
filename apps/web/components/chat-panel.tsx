import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Send, RefreshCw, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { getChatThreadDetails, createChatThreadAndPostMessage, postChatMessage, getChatEvents, DisplayableBamlEvent } from '@/app/projects/[id]/actions';
import type {
  UserInput as BamlUserInput,
  Event as BamlEvent,
  AssisantMessage as BamlAssistantMessage,
  UpdateEstimateRequest as BamlUpdateEstimateRequest,
  UpdateEstimateResponse as BamlUpdateEstimateResponse,
  PatchEstimateRequest as BamlPatchEstimateRequest,
  PatchEstimateResponse as BamlPatchEstimateResponse,
  AllowedTypes
} from '@/baml_client/baml_client/types';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  threadId?: string | null; // Renamed from externalThreadId in previous plan, using this prop name
  forceNewChat?: boolean;
  onChatThreadCreated?: () => void; // ADDED: Callback when a new thread is successfully created
  onEstimateUpdateTriggered?: (isPatch?: boolean, patchedFields?: string[]) => void; // ADDED: Callback when estimate update is triggered
}

export function ChatPanel({ isOpen, onClose, projectId, threadId: initialThreadIdProp, forceNewChat = false, onChatThreadCreated, onEstimateUpdateTriggered }: ChatPanelProps) {
  // Internal state for the active thread ID
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadIdProp || null);
  const [threadName, setThreadName] = useState<string | null>(null);
  const [events, setEvents] = useState<DisplayableBamlEvent[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isAssistantUpdatingEstimate, setIsAssistantUpdatingEstimate] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState<boolean>(false); // Changed initial to false, will set true during load
  // ADDED: State for managing expansion of UpdateEstimateRequest events
  const [expandedUpdateRequests, setExpandedUpdateRequests] = useState<Record<string, boolean>>({});
  // Add state for panel width
  const [panelWidth, setPanelWidth] = useState<number>(384); // Default width: 96 from 'w-96' (384px)
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Helper function to check if there's an active patch request without a response
  const hasActivePatchRequest = useCallback(() => {
    return events.some(e => e.type === 'PatchEstimateRequest' && 
                    !events.some(r => r.type === 'PatchEstimateResponse' && 
                                  new Date(r.createdAt) > new Date(e.createdAt)));
  }, [events]);

  // Handle start resizing
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Store the initial coordinates
    const initialX = e.clientX;
    const initialWidth = panelWidth;
    console.log('Resize started at X:', initialX, 'with initial width:', initialWidth);

    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Calculate how far we've moved and in which direction
      const deltaX = initialX - moveEvent.clientX;
      // Increase the width when dragging left, decrease when dragging right
      const newWidth = initialWidth + deltaX;

      // Apply constraints
      const windowWidth = window.innerWidth;
      const minWidth = 300;
      const maxWidth = Math.min(800, windowWidth * 0.75);
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      console.log('Mouse moved to:', moveEvent.clientX, 'Delta:', deltaX, 'New width:', constrainedWidth);
      setPanelWidth(constrainedWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      console.log('Resize ended, final width:', panelWidth);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);



  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [newMessage]);

  // ADDED: Function to toggle expansion state for UpdateEstimateRequest events
  const toggleUpdateRequestExpansion = (eventId: string) => {
    setExpandedUpdateRequests(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // Effect for initial load & when initialThreadIdProp or forceNewChat changes
  useEffect(() => {
    if (!isOpen) {
        setActiveThreadId(null); // Clear active thread when panel closes
        setEvents([]);
        setThreadName(null);
        return;
    }

    // If forceNewChat is true, we start with a null activeThreadId.
    // The thread will be created on the first message send.
    if (forceNewChat) {
      console.log('ChatPanel: forceNewChat is true. Ready for new thread on first message.');
      setActiveThreadId(null);
      setThreadName('New Chat'); // Placeholder name
      setEvents([]);
      setIsLoadingThread(false);
      setError(null);
      return;
    }

    // If an initialThreadIdProp is provided (and not forcing new chat), load it.
    if (initialThreadIdProp) {
      console.log(`ChatPanel: Loading thread with initialThreadIdProp: ${initialThreadIdProp}`);
      setActiveThreadId(initialThreadIdProp);
      // Loading logic for this specific thread ID is handled in the next useEffect
      // which depends on activeThreadId.
    } else {
      // No initial thread and not forcing new chat - essentially an empty state until a thread is selected
      // or a new chat is explicitly started by sending a message.
      console.log('ChatPanel: No initial thread, not forcing new. Waiting for action.');
      setActiveThreadId(null);
      setThreadName(null);
      setEvents([]);
      setIsLoadingThread(false);
      setError(null);
    }
  }, [isOpen, initialThreadIdProp, forceNewChat]);

  // Effect for loading messages when activeThreadId changes (and is not null)
  useEffect(() => {
    if (!isOpen || !activeThreadId) {
      // If no active thread, ensure events are clear and not loading
      if (!activeThreadId) {
        setEvents([]);
        setThreadName(null); // Or 'New Chat' if that's preferred for a pending new chat
        setIsLoadingThread(false);
      }
      return;
    }

    console.log(`ChatPanel: activeThreadId changed to ${activeThreadId}, attempting to load details.`);
    setIsLoadingThread(true);
    setError(null);
    setEvents([]); // Clear previous events before loading new ones

    const loadThreadDetails = async () => {
      try {
        const details = await getChatThreadDetails(activeThreadId);
        if (details) {
          setThreadName(details.name);
          setEvents(details.events);
          // Check for ongoing estimate update from loaded events
          const lastEvent = details.events[details.events.length - 1];
          if (lastEvent && lastEvent.type === 'UpdateEstimateRequest') {
            const correspondingResponse = details.events
              .slice(details.events.indexOf(lastEvent) + 1)
              .find(e => e.type === 'UpdateEstimateResponse');
            if (!correspondingResponse) {
              setIsAssistantUpdatingEstimate(true);
            }
          }
        } else {
          setError(`Failed to load chat thread: ${activeThreadId}. It might have been deleted or an error occurred.`);
          setActiveThreadId(null); // Reset if thread not found
          setThreadName(null);
        }
      } catch (err) {
        console.error('Error loading chat thread details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat thread details.');
        setActiveThreadId(null); // Reset on error
        setThreadName(null);
      } finally {
        setIsLoadingThread(false);
      }
    };

    loadThreadDetails();
  }, [isOpen, activeThreadId]); // Primary dependency is activeThreadId

  // Effect for polling new events - depends on activeThreadId
  useEffect(() => {
    if (!isOpen || !activeThreadId) return;

    // Function to check for new events - pulled out to allow immediate check after patch request
    // This helps unblock the chat input as soon as a patch response is received, rather than waiting for next poll
    const checkForNewEvents = async () => {
      try {
        const lastEventTimestamp = events.length > 0 ? events[events.length - 1].createdAt : undefined;
        // Pass activeThreadId to getChatEvents
        const newEvents = await getChatEvents(activeThreadId, lastEventTimestamp);
        if (newEvents.length > 0) {
          setEvents(prevEvents => {
            const allEvents = [...prevEvents];
            newEvents.forEach(newEvent => {
              if (!allEvents.find(e => e.id === newEvent.id)) {
                allEvents.push(newEvent);
              }
            });
            return allEvents;
          });

          // Process response events immediately to unblock chat input
          newEvents.forEach(event => {
            if (event.type === 'UpdateEstimateResponse') {
              console.log('Found UpdateEstimateResponse event, unblocking chat input');
              setIsAssistantUpdatingEstimate(false);
            }
            else if (event.type === 'PatchEstimateResponse') {
              setIsAssistantUpdatingEstimate(false);
              
              // Find the corresponding request event to get the patch fields
              const requestEvent = events.find(e => 
                e.type === 'PatchEstimateRequest' && 
                new Date(e.createdAt) < new Date(event.createdAt) &&
                // Find the most recent request before this response
                !events.some(other => 
                  other.type === 'PatchEstimateResponse' &&
                  new Date(other.createdAt) < new Date(event.createdAt) &&
                  new Date(other.createdAt) > new Date(e.createdAt)
                )
              );
              
              if (requestEvent && requestEvent.data) {
                if (requestEvent.type === 'PatchEstimateRequest') {
                  const requestData = requestEvent.data as BamlPatchEstimateRequest;
                  if (requestData.patches) {
                    // Extract field paths that were patched
                    const patchedPaths = (requestData.patches as Array<{ json_path: string }>).map(patch => patch.json_path);
                    // Dispatch custom event to trigger flash animation
                    const customEvent = new CustomEvent('patchCompleted', {
                      detail: { fields: patchedPaths }
                    });
                    window.dispatchEvent(customEvent);
                  }
                }
              }
            }
          });
        }
      } catch (err) {
        console.warn('Polling for chat events failed:', err);
      }
    };

    // Initial check when component mounts or activeThreadId changes
    checkForNewEvents();

    // Regular polling interval
    const intervalId = setInterval(checkForNewEvents, 3000);

    return () => clearInterval(intervalId);
  }, [activeThreadId, events, isOpen]); // Depends on activeThreadId

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // Cleanup event listeners when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup is now handled within the startResizing function
    };
  }, []);

  // Update body cursor during resize
  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = 'ew-resize';
    } else {
      document.body.style.cursor = '';
    }

    return () => {
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    if (!projectId) {
      setError('Cannot send message: No active project context.');
      return;
    }

    setIsSending(true);
    setError(null);
    const userInput: BamlUserInput = { message: newMessage };
    const currentNewMessage = newMessage; // Capture message before clearing
    setNewMessage(''); // Clear input immediately

    // Optimistically add user message
    const tempUserEventId = `temp-user-${Date.now()}`;
    const optimisticUserEvent: DisplayableBamlEvent = {
        id: tempUserEventId,
        type: 'UserInput' as AllowedTypes,
        data: userInput,
        createdAt: new Date().toISOString(),
    };
    setEvents(prev => [...prev, optimisticUserEvent]);

    try {
      if (!activeThreadId) {
        // This is the first message in a new chat, create thread first
        console.log('ChatPanel: Sending first message, creating new thread...');
        const result = await createChatThreadAndPostMessage(projectId, userInput);

        if (result.error || !result.newThreadId) {
          setError(result.error || 'Failed to create new chat thread.');
          setEvents(prevEvents => prevEvents.filter(event => event.id !== tempUserEventId)); // Remove optimistic
          setNewMessage(currentNewMessage); // Restore message on failure
          return;
        }

        // Call the callback to notify parent that a new thread was created
        if (onChatThreadCreated) {
          onChatThreadCreated();
        }

        setActiveThreadId(result.newThreadId);
        // The thread name is set by the server action, could also update it here if needed
        // For example, if createChatThreadAndPostMessage returned the name:
        // if (result.threadName) setThreadName(result.threadName);
        setEvents(prevEvents => {
          const newEventsList = prevEvents.filter(event => event.id !== tempUserEventId);
          if (result.userInputDisplayEvent) newEventsList.push(result.userInputDisplayEvent);
          if (result.assistantResponseDisplayEvent) {
            newEventsList.push(result.assistantResponseDisplayEvent);
            if (result.assistantResponseDisplayEvent.type === 'UpdateEstimateRequest' ||
                result.assistantResponseDisplayEvent.type === 'PatchEstimateRequest') {
              setIsAssistantUpdatingEstimate(true);
            }
          }
          return newEventsList;
        });

        // ---> ADDED: Trigger estimate update callback with patch info
        if (result.updateTriggered && onEstimateUpdateTriggered) {
          // Check if this is a patch operation
          const isPatch = result.assistantResponseDisplayEvent?.type === 'PatchEstimateRequest';
          const patchedFields = isPatch ?
            (result.assistantResponseDisplayEvent?.data as BamlPatchEstimateRequest).patches.map(p => p.json_path) :
            undefined;
          onEstimateUpdateTriggered(isPatch, patchedFields);
        }

      } else {
        // Existing thread, just post the message
        console.log(`ChatPanel: Sending message to existing thread: ${activeThreadId}`);
        const result = await postChatMessage(activeThreadId, projectId, userInput);

        setEvents(prevEvents => {
          const newEventsList = prevEvents.filter(event => event.id !== tempUserEventId);
          newEventsList.push(result.userInputDisplayEvent);
          if (result.assistantResponseDisplayEvent) {
            newEventsList.push(result.assistantResponseDisplayEvent);
            if (result.assistantResponseDisplayEvent.type === 'UpdateEstimateRequest' ||
                result.assistantResponseDisplayEvent.type === 'PatchEstimateRequest') {
              setIsAssistantUpdatingEstimate(true);
            }
          }
          return newEventsList;
        });

        // ---> ADDED: Trigger estimate update callback with patch info
        if (result.updateTriggered && onEstimateUpdateTriggered) {
          // Check if this is a patch operation
          const isPatch = result.assistantResponseDisplayEvent?.type === 'PatchEstimateRequest';
          const patchedFields = isPatch ?
            (result.assistantResponseDisplayEvent?.data as BamlPatchEstimateRequest).patches.map(p => p.json_path) :
            undefined;
          onEstimateUpdateTriggered(isPatch, patchedFields);
        }

        if (result.error) {
          setError(result.error);
          // Optionally restore message if only BAML part failed but user input was saved
          if (!result.userInputDisplayEvent.id.startsWith('temp-error')) {
            // User input was saved, don't restore message field
          } else {
            setNewMessage(currentNewMessage);
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error posting message:', error);
      setError(error.message || 'Failed to send message.');
      setEvents(prevEvents => prevEvents.filter(event => event.id !== tempUserEventId)); // Remove optimistic
      setNewMessage(currentNewMessage); // Restore message on hard failure
    } finally {
      setIsSending(false);
    }
  };

  const renderEventData = (event: DisplayableBamlEvent) => {
    switch (event.type) {
      case 'UserInput':
        return <p>{(event.data as BamlUserInput).message}</p>;
      case 'AssisantMessage': // Corrected to AssisantMessage if that is the type from BAML
        return (
          <div className="prose prose-invert max-w-none prose-p:my-2 prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-headings:text-blue-400 prose-headings:border-b prose-headings:border-gray-700 prose-headings:pb-1 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-code:text-blue-300 prose-code:bg-gray-900/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown>
              {(event.data as BamlAssistantMessage).message}
            </ReactMarkdown>
          </div>
        );
      case 'PatchEstimateRequest':
        const patchRequestData = event.data as BamlPatchEstimateRequest;
        const isPatchExpanded = expandedUpdateRequests[event.id];
        return (
          <div>
            <p><strong>System:</strong> ⚡ Quick patch in progress...</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleUpdateRequestExpansion(event.id)}
              className="text-blue-400 hover:text-blue-300 px-1 py-0 h-auto text-xs mt-1 flex items-center"
            >
              {isPatchExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {isPatchExpanded ? 'Hide Details' : 'Show Details'}
            </Button>
            {isPatchExpanded && (
              <div className="mt-2 pt-2 border-t border-yellow-600/30">
                <p className="text-sm italic">
                  Patches: {patchRequestData.patches.map(p =>
                    `${p.operation} ${p.json_path}${p.new_value ? ' to ' + p.new_value : ''}`
                  ).join(', ')}
                </p>
              </div>
            )}
          </div>
        );
      case 'PatchEstimateResponse':
        const patchResponseData = event.data as BamlPatchEstimateResponse;
        const allPatchesSucceeded = patchResponseData.patch_results.every(r => r.success);
        if (allPatchesSucceeded) {
          return <p><strong>System:</strong> ✅ Estimate updated.</p>;
        }
        return (
          <div>
            <p><strong>System:</strong> ⚠️ Some patches failed. Falling back to full update.</p>
            <div className="mt-2 text-sm text-red-400">
              {patchResponseData.patch_results
                .filter(r => !r.success)
                .map((r, i) => <p key={i}>Error: {r.error_message}</p>)}
            </div>
          </div>
        );
      case 'UpdateEstimateRequest':
        const requestData = event.data as BamlUpdateEstimateRequest;
        const isExpanded = expandedUpdateRequests[event.id];
        return (
          <div>
            <p><strong>System:</strong> Agent updating estimate.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleUpdateRequestExpansion(event.id)}
              className="text-blue-400 hover:text-blue-300 px-1 py-0 h-auto text-xs mt-1 flex items-center"
            >
              {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {isExpanded ? 'Hide Details' : 'Show Details'}
            </Button>
            {isExpanded && (
              <div className="mt-2 pt-2 border-t border-yellow-600/30">
                <p className="text-sm italic">
                  Changes: {requestData.changes_to_make}
                </p>
              </div>
            )}
          </div>
        );
      case 'UpdateEstimateResponse':
        const responseData = event.data as BamlUpdateEstimateResponse;
        if (responseData.success) {
          return <p><strong>System:</strong> Estimate updated.</p>;
        }
        return <p><strong>System:</strong> Project estimate update failed. Error: {responseData.error_message}</p>;
      default:
        return <p><em>Unknown event type: {event.type}</em></p>;
    }
  };

  // Conditional rendering based on whether it's a new, uninitialized chat
  const isNewUninitializedChat = !activeThreadId && !isLoadingThread && (forceNewChat || !initialThreadIdProp);

  // Make sure all hooks are called unconditionally before any early returns
  if (!isOpen) {
    return null;
  }


  if (isLoadingThread) {
    return (
      <div
        className="fixed top-0 right-0 h-full bg-gray-800 text-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col z-40
                  border-l border-gray-700"
        style={{
          marginTop: 'var(--header-height, 64px)',
          height: 'calc(100% - var(--header-height, 64px))',
          width: `${panelWidth}px`,
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Loading Chat...</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-pulse flex items-center">
            <div className="h-4 w-4 bg-blue-600 rounded-full mr-2"></div>
            <div className="h-4 w-4 bg-blue-600 rounded-full mr-2 animate-pulse delay-75"></div>
            <div className="h-4 w-4 bg-blue-600 rounded-full animate-pulse delay-150"></div>
            <span className="ml-3 text-gray-300">Loading chat...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      {/* Resize handle */}
      <div
        className={`fixed top-0 bottom-0 z-50 w-5 cursor-ew-resize ${isResizing ? 'bg-blue-500/50' : 'bg-transparent hover:bg-blue-500/20'} transition-opacity`}
        style={{
          left: `calc(100% - ${panelWidth}px - 4px)`,
          marginTop: 'var(--header-height, 64px)',
          height: 'calc(100% - var(--header-height, 64px))'
        }}
        onMouseDown={startResizing}
      >
        <div className="absolute left-0 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-500 rounded-full p-1">
          <GripVertical className="h-4 w-4 text-white" />
        </div>
      </div>

      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full bg-gray-800 text-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col z-40
                  ${isOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-gray-700`}
        style={{
          marginTop: 'var(--header-height, 64px)',
          height: 'calc(100% - var(--header-height, 64px))',
          width: `${panelWidth}px`,
        }}
      >
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">
          {isLoadingThread ? 'Loading Chat...' : (threadName || (isNewUninitializedChat ? 'New Chat' : 'Chat'))}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {isLoadingThread && (
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-pulse flex items-center">
            <div className="h-4 w-4 bg-blue-600 rounded-full mr-2"></div>
            <div className="h-4 w-4 bg-blue-600 rounded-full mr-2 animate-pulse delay-75"></div>
            <div className="h-4 w-4 bg-blue-600 rounded-full animate-pulse delay-150"></div>
            <span className="ml-3 text-gray-300">Loading chat...</span>
          </div>
        </div>
      )}

      {!isLoadingThread && (
        <>
          <div className="flex-grow p-4 space-y-4 overflow-y-auto bg-gray-900/80 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900">
            {isNewUninitializedChat && events.length === 0 && (
              <div className="text-center text-gray-400 pt-10">
                <p>Send a message to start the conversation.</p>
              </div>
            )}
            {events.map(event => (
              <div key={event.id} className={`flex ${event.type === 'UserInput' ? 'justify-end' : 'justify-start'} mb-4`}>
                <div
                  className={`max-w-[85%] p-4 rounded-lg shadow-lg
                    ${event.type === 'UserInput' ? 'bg-blue-600 text-white border border-blue-700/50' : 'bg-gray-800 text-gray-200 border border-gray-700'}
                    ${event.type === 'UpdateEstimateRequest' || event.type === 'UpdateEstimateResponse' ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-400 w-full' : ''}
                    ${event.type === 'PatchEstimateRequest' ? 'bg-blue-900/30 border border-blue-700 text-blue-400 w-full' : ''}
                    ${event.type === 'PatchEstimateResponse' ? 'bg-green-900/30 border border-green-700 text-green-400 w-full' : ''}
                  `}
                >
                  {renderEventData(event)}
                  <div className="text-xs mt-2 opacity-70">
                    {new Date(event.createdAt).toLocaleTimeString()} - {new Date(event.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {error && <div className="p-2 text-red-500 border-t border-gray-700">Error: {error}</div>}
          {isAssistantUpdatingEstimate && (
            <div className="p-2 border-t border-gray-700">
              {hasActivePatchRequest() ? (
                <div className="text-blue-400 bg-blue-900/30 p-2 rounded flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Applying quick patch...
                </div>
              ) : (
                <div className="text-blue-400 bg-blue-900/30 p-2 rounded flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating estimate...
                </div>
              )}
            </div>
          )}

          <div className="p-4 border-t border-gray-700 bg-gray-800">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  // Auto-resize the textarea based on content - handled by the useEffect
                }}
                placeholder={isNewUninitializedChat && !projectId ? "Select a project to start chat" : "Type your message... (Shift+Enter for new line)"}
                className="flex-grow px-3 py-4 bg-gray-700 border border-gray-600 rounded-md text-gray-200 resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
                disabled={isSending || 
                    (isAssistantUpdatingEstimate && !hasActivePatchRequest()) || 
                    (isNewUninitializedChat && !projectId) }
                rows={3} // Start with 3 rows instead of 1
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                style={{ minHeight: '80px', maxHeight: '250px' }} // Increase min/max height
              />
              <Button
                type="submit"
                variant="ghost"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                disabled={isSending || !newMessage.trim() || 
                          (isAssistantUpdatingEstimate && !hasActivePatchRequest()) || 
                          (isNewUninitializedChat && !projectId)}
              >
                {isSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
    </React.Fragment>
  );
} 