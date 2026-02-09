import React from "react";

interface Tab {
  id: string;
  label: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = "",
}) => {
  return (
    <div className={`flex border-b border-white/5 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-3 text-xs font-medium uppercase tracking-widest transition-colors relative ${
            activeTab === tab.id
              ? "text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded ml-1">
                {tab.badge}
              </span>
            )}
          </span>
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
          )}
        </button>
      ))}
    </div>
  );
};

export default Tabs;
