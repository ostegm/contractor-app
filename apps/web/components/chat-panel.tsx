import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Send, CornerDownLeft } from 'lucide-react';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId?: string | null; // To potentially load different chats
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export function ChatPanel({ isOpen, onClose, currentChatId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    // Placeholder messages
    { id: '1', text: 'Hello! How can I help you with this project estimate?', sender: 'ai', timestamp: new Date(Date.now() - 1000 * 60 * 5) },
    { id: '2', text: 'I have some questions about the material costs.', sender: 'user', timestamp: new Date(Date.now() - 1000 * 60 * 3) },
    { id: '3', text: 'Sure, what are your specific questions regarding material costs?', sender: 'ai', timestamp: new Date(Date.now() - 1000 * 60 * 1) },
  ]);
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      setMessages([
        ...messages,
        { id: String(Date.now()), text: newMessage, sender: 'user', timestamp: new Date() },
      ]);
      setNewMessage('');
      // TODO: Add logic to send message to backend and get AI response
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className={`fixed top-0 right-0 h-full bg-gray-800 text-white shadow-xl transition-transform duration-300 ease-in-out flex flex-col z-40 
                  ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full md:w-96 border-l border-gray-700`}
      style={{ marginTop: 'var(--header-height, 64px)', height: 'calc(100% - var(--header-height, 64px))' }}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Chat with AI Assistant</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Message Area */}
      <div className="flex-grow p-4 space-y-4 overflow-y-auto bg-gray-850 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-850">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg shadow 
                          ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}
            >
              <p className="text-sm">{msg.text}</p>
              <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="flex-grow bg-gray-700 border-gray-600 text-white resize-none p-2 pr-10 scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-700"
            rows={1} // Start with 1 row, can expand
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            style={{ minHeight: '40px', maxHeight: '120px' }} // Control min/max height for textarea
          />
          <Button type="submit" variant="ghost" size="icon" className="text-blue-500 hover:text-blue-400 disabled:text-gray-500" disabled={!newMessage.trim()}>
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
} 