import React from 'react';
import { Loader2, Search, Brain, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface AgentThinkingIndicatorProps {
  phase: string;
  message: string;
}

const phaseIcons: Record<string, React.ReactNode> = {
  generating_queries: <Brain className="w-5 h-5" />,
  searching: <Search className="w-5 h-5" />,
  analyzing: <Sparkles className="w-5 h-5" />,
  reading_pages: <FileText className="w-5 h-5" />,
  structuring: <Brain className="w-5 h-5" />,
  generating_options: <Sparkles className="w-5 h-5" />,
  processing: <Loader2 className="w-5 h-5 animate-spin" />,
  searching_fallback: <Search className="w-5 h-5" />,
  category_selected: <CheckCircle2 className="w-5 h-5" />,
  initializing: <Loader2 className="w-5 h-5 animate-spin" />,
};

export const AgentThinkingIndicator: React.FC<AgentThinkingIndicatorProps> = ({ phase, message }) => {
  const icon = phaseIcons[phase] || <Loader2 className="w-5 h-5 animate-spin" />;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg backdrop-blur-sm">
      <div className="text-purple-400 animate-pulse">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-300">{message}</p>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};
