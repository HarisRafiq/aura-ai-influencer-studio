import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface AgentStreamingMessageProps {
  content: string;
  isComplete: boolean;
  role?: 'assistant' | 'user';
}

export const AgentStreamingMessage: React.FC<AgentStreamingMessageProps> = ({ 
  content, 
  isComplete,
  role = 'assistant'
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (isComplete) {
      setDisplayedContent(content);
      setShowCursor(false);
      return;
    }

    // Simulate streaming effect if content is added
    if (content.length > displayedContent.length) {
      const timer = setTimeout(() => {
        setDisplayedContent(content.slice(0, displayedContent.length + 1));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [content, displayedContent, isComplete]);

  // Cursor blink effect
  useEffect(() => {
    if (!showCursor) return;
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, [showCursor]);

  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl rounded-tr-sm">
          <p className="text-white text-sm">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 max-w-[80%] px-4 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl rounded-tl-sm">
        <p className="text-gray-200 text-sm whitespace-pre-wrap">
          {displayedContent}
          {!isComplete && showCursor && (
            <span className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5 align-middle" />
          )}
        </p>
      </div>
    </div>
  );
};
