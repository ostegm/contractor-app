'use client'

import React, { useState, useEffect, FormEvent, useRef } from 'react';
import { getOrCreateChatThread, postChatMessage, getChatEvents, DisplayableBamlEvent } from '../actions';
import type { UserInput as BamlUserInput, AssisantMessage as BamlAssistantMessage, UpdateEstimateRequest as BamlUpdateEstimateRequest, UpdateEstimateResponse as BamlUpdateEstimateResponse, AllowedTypes } from '@/baml_client/baml_client/types';

interface ChatInterfaceProps {
  projectId: string;
}

export default function ChatInterface({ projectId }: ChatInterfaceProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadName, setThreadName] = useState<string | null>(null);
  const [events, setEvents] = useState<DisplayableBamlEvent[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isAssistantUpdatingEstimate, setIsAssistantUpdatingEstimate] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState<boolean>(true);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Effect for initial load and projectId changes
  useEffect(() => {
    if (!projectId) return;

    setIsLoadingThread(true);
    setError(null);
    setEvents([]); // Clear previous events

    getOrCreateChatThread(projectId)
      .then(data => {
        setThreadId(data.threadId);
        setEvents(data.events);
        setThreadName(data.name);
        // Check if the last event was an UpdateEstimateRequest to set initial isAssistantUpdatingEstimate
        const lastEvent = data.events[data.events.length -1];
        if (lastEvent && lastEvent.type === 'UpdateEstimateRequest') {
            // We need to see if an UpdateEstimateResponse has already come in for this
            const correspondingResponse = data.events.slice(data.events.indexOf(lastEvent) + 1)
                                          .find(e => e.type === 'UpdateEstimateResponse');
            if (!correspondingResponse) {
                 setIsAssistantUpdatingEstimate(true);
            }
        }
      })
      .catch(err => {
        console.error('Error getting or creating chat thread:', err);
        setError(err.message || 'Failed to load chat thread.');
      })
      .finally(() => {
        setIsLoadingThread(false);
      });
  }, [projectId]);

  // Effect for polling new events
  useEffect(() => {
    if (!threadId) return;

    const intervalId = setInterval(async () => {
      try {
        const lastEventTimestamp = events.length > 0 ? events[events.length - 1].createdAt : undefined;
        const newEvents = await getChatEvents(threadId, lastEventTimestamp);
        if (newEvents.length > 0) {
          setEvents(prevEvents => {
            const allEvents = [...prevEvents];
            newEvents.forEach(newEvent => {
              if (!allEvents.find(e => e.id === newEvent.id)) { // Prevent duplicates
                allEvents.push(newEvent);
              }
            });
            // Check the latest incoming events for UpdateEstimateResponse
            newEvents.forEach(event => {
              if (event.type === 'UpdateEstimateResponse') {
                setIsAssistantUpdatingEstimate(false);
              }
            });
            return allEvents;
          });
        }
      } catch (err) {
        console.warn('Polling for chat events failed:', err);
        // Optionally set a non-critical error for polling failures
      }
    }, 3000); // Poll every 3 seconds, adjust as needed

    return () => clearInterval(intervalId);
  }, [threadId, events]); // Re-run if threadId changes or new events are added locally to update timestamp

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !threadId || isSending) return;

    setIsSending(true);
    setError(null);

    const userInput: BamlUserInput = { message: newMessage };

    // Optimistically add user message
    const tempUserEventId = `temp-user-${Date.now()}`;
    const optimisticUserEvent: DisplayableBamlEvent = {
        id: tempUserEventId,
        type: 'UserInput' as AllowedTypes, // Cast as AllowedTypes is a type union
        data: userInput,
        createdAt: new Date().toISOString(),
    };
    setEvents(prev => [...prev, optimisticUserEvent]);
    setNewMessage('');

    try {
      const result = await postChatMessage(threadId, projectId, userInput);

      setEvents(prevEvents => {
        // Replace optimistic event with actual from server, and add assistant response
        const newEventsList = prevEvents.filter(event => event.id !== tempUserEventId);
        newEventsList.push(result.userInputDisplayEvent);
        if (result.assistantResponseDisplayEvent) {
          newEventsList.push(result.assistantResponseDisplayEvent);
          if (result.assistantResponseDisplayEvent.type === 'UpdateEstimateRequest') {
            setIsAssistantUpdatingEstimate(true);
          }
        }
        return newEventsList;
      });

      if (result.error) {
        setError(result.error);
      }
      // updateTriggered is handled by assistantResponseDisplayEvent.type check above for setting isAssistantUpdatingEstimate

    } catch (err: any) {
      console.error('Error posting message:', err);
      setError(err.message || 'Failed to send message.');
      // Remove optimistic event if post fails hard
      setEvents(prevEvents => prevEvents.filter(event => event.id !== tempUserEventId));
    } finally {
      setIsSending(false);
    }
  };

  const renderEventData = (event: DisplayableBamlEvent) => {
    switch (event.type) {
      case 'UserInput':
        return <p>{(event.data as BamlUserInput).message}</p>;
      case 'AssisantMessage': // Corrected to AssisantMessage if that is the type from BAML
        return <p>{(event.data as BamlAssistantMessage).message}</p>;
      case 'UpdateEstimateRequest':
        return (
          <div>
            <p><strong>Assistant:</strong> I need to update the project estimate.</p>
            <p><em>Changes: {(event.data as BamlUpdateEstimateRequest).changes_to_make}</em></p>
          </div>
        );
      case 'UpdateEstimateResponse':
        const responseData = event.data as BamlUpdateEstimateResponse;
        if (responseData.success) {
          return <p><strong>System:</strong> Project estimate update request processed successfully.</p>;
        }
        return <p><strong>System:</strong> Project estimate update failed. Error: {responseData.error_message}</p>;
      default:
        return <p><em>Unknown event type: {event.type}</em></p>;
    }
  };

  if (isLoadingThread) {
    return <div className="p-4 text-gray-300 bg-gray-800 rounded-lg border border-gray-700 h-full min-h-[400px] flex items-center justify-center shadow-md">
      <div className="animate-pulse flex items-center">
        <div className="h-4 w-4 bg-blue-600 rounded-full mr-2"></div>
        <div className="h-4 w-4 bg-blue-600 rounded-full mr-2 animate-pulse delay-75"></div>
        <div className="h-4 w-4 bg-blue-600 rounded-full animate-pulse delay-150"></div>
        <span className="ml-3">Loading chat...</span>
      </div>
    </div>;
  }

  return (
    <div className="flex flex-col h-full min-h-[400px] max-h-[calc(100vh-200px)] border border-gray-700 rounded-lg bg-gray-800 shadow-md">
      <div className="p-2 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200">{threadName || 'Chat'}</h2>
      </div>
      <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-gray-900/80">
        {events.map(event => (
          <div key={event.id} className={`flex ${event.type === 'UserInput' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] p-3 rounded-lg shadow-lg
                ${event.type === 'UserInput' ? 'bg-blue-600 text-white border border-blue-700/50' : 'bg-gray-800 text-gray-200 border border-gray-700'}
                ${event.type === 'UpdateEstimateRequest' || event.type === 'UpdateEstimateResponse' ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-400 w-full' : ''}
              `}
            >
              {renderEventData(event)}
              <div className="text-xs mt-1 opacity-70">
                {new Date(event.createdAt).toLocaleTimeString()} - {new Date(event.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      {error && <div className="p-2 text-red-500 border-t border-gray-700">Error: {error}</div>}
      {isAssistantUpdatingEstimate && (
        <div className="p-2 text-blue-400 border-t border-gray-700 bg-blue-900/30">
          Assistant is updating the estimate...
        </div>
      )}
      <form onSubmit={handleSendMessage} className="p-2 border-t border-gray-700 flex items-center gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-grow px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
          disabled={isSending || isAssistantUpdatingEstimate}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          disabled={isSending || !newMessage.trim() || isAssistantUpdatingEstimate}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
} 