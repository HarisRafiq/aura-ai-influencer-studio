import React from "react";
import { Sparkles, Compass, Plane, Pencil, Send, Wand2 } from "lucide-react";

interface ControlBarProps {
  onClicked: () => void;
  onAgentClicked?: () => void;
  onOrchestratorClicked?: () => void;
  disabled?: boolean;
}

const ControlBar: React.FC<ControlBarProps> = ({
  onClicked,
  onAgentClicked,
  onOrchestratorClicked,
  disabled,
}) => {
  return (
    <div className="sticky top-[61px] z-30 w-full px-4 pt-2 pb-6 bg-gradient-to-b from-[#030014] via-[#030014]/98 to-transparent backdrop-blur-md pointer-events-none">
      <div className="max-w-[500px] mx-auto space-y-4 pointer-events-auto">
        {/* Mock Post Input Area */}
        <div
          onClick={onClicked}
          className={`
            relative flex items-center gap-3 p-3.5 rounded-2xl
            bg-white/10 border border-white/20 hover:border-indigo-500/50
            cursor-pointer group transition-all duration-300
            shadow-2xl shadow-black/60 backdrop-blur-2xl
            ${disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
          `}
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
            <Pencil size={16} className="text-white" />
          </div>

          <div className="flex-1 text-sm font-medium text-gray-300 group-hover:text-white transition-colors text-left">
            What's on your influencer's mind?
          </div>

          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:scale-110 transition-all duration-300">
            <Send size={16} className="text-gray-400 group-hover:text-white" />
          </div>

          {/* Animated Glow Effect */}
          <div className="absolute inset-0 rounded-2xl bg-indigo-500/0 group-hover:bg-indigo-500/10 transition-all duration-500 -z-10 blur-xl opacity-0 group-hover:opacity-100" />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {/* Orchestrator Button */}
          {onOrchestratorClicked && (
            <button
              onClick={onOrchestratorClicked}
              disabled={disabled}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600/20 to-blue-600/20 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-100 font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" />
              <span>Research & Create</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ControlBar;
