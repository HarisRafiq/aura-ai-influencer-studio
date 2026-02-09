import React from 'react';
import { Check } from 'lucide-react';

interface AvatarSelectorProps {
    images: string[];
    selectedHash: string | null;
    onSelect: (imageUrl: string) => void;
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({ images, selectedHash, onSelect }) => {
    return (
        <div className="grid grid-cols-2 gap-4 w-full aspect-square relative">
            {images.map((img, idx) => (
                <button
                    key={idx}
                    onClick={() => onSelect(img)}
                    className={`
                        relative rounded-3xl overflow-hidden group transition-all duration-500
                        ${selectedHash === img ? 'ring-[6px] ring-indigo-500/50 scale-[0.98] shadow-[0_0_40px_rgba(99,102,241,0.4)]' : 'hover:scale-[0.98] hover:ring-2 hover:ring-white/20 shadow-2xl'}
                    `}
                >
                    <img 
                        src={img} 
                        alt={`Option ${idx + 1}`} 
                        className="w-full h-full object-cover transition-transform duration-[1000ms] group-hover:scale-110" 
                    />
                    
                    {/* Selection Overlay */}
                    {selectedHash === img && (
                        <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center backdrop-blur-[1px]">
                            <div className="bg-white rounded-full p-2.5 text-indigo-600 shadow-2xl animate-in zoom-in-50 duration-500">
                                <Check size={20} strokeWidth={4} />
                            </div>
                        </div>
                    )}
                    
                    {/* Hover Overlay */}
                    {selectedHash !== img && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                            <span className="text-white text-[10px] font-black uppercase tracking-[0.2em] bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20">
                                Choose Aura
                            </span>
                        </div>
                    )}
                </button>
            ))}
        </div>
    );
};
