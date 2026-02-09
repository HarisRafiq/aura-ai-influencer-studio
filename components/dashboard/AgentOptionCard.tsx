import React, { useState } from 'react';
import { ChevronDown, ExternalLink, MapPin, Calendar, Star } from 'lucide-react';
import { Button } from '../ui/Button';

interface AgentOptionCardProps {
  option: string;
  index: number;
  onSelect: () => void;
  itemData?: {
    name: string;
    description: string;
    details?: string;
    why_notable?: string;
    url?: string;
  };
}

export const AgentOptionCard: React.FC<AgentOptionCardProps> = ({ 
  option, 
  index, 
  onSelect,
  itemData 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className="group relative bg-white/5 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden hover:bg-white/10 hover:border-purple-500/30 transition-all duration-200 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="p-4" onClick={onSelect}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-medium text-sm mb-1 group-hover:text-purple-300 transition-colors">
              {option}
            </h4>
            {itemData?.description && (
              <p className="text-gray-400 text-xs line-clamp-2">
                {itemData.description}
              </p>
            )}
          </div>
          {itemData && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex-shrink-0 text-gray-400 hover:text-purple-400 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Expanded details */}
        {isExpanded && itemData && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2 animate-fadeIn">
            {itemData.details && (
              <div className="flex items-start gap-2 text-xs">
                <MapPin className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{itemData.details}</span>
              </div>
            )}
            {itemData.why_notable && (
              <div className="flex items-start gap-2 text-xs">
                <Star className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{itemData.why_notable}</span>
              </div>
            )}
            {itemData.url && (
              <a
                href={itemData.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span className="truncate">View source</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Gradient hover effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
};
