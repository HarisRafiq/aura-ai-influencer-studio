import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Clock } from "lucide-react";
import { Influencer } from "../../types";
import { Tooltip, Badge, IconButton } from "../ui";

interface DashboardHeaderProps {
  influencer: Influencer;
  onTravelClick: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  influencer,
  onTravelClick,
}) => {
  const navigate = useNavigate();
  const [localTime, setLocalTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      try {
        const time = new Date().toLocaleTimeString("en-US", {
          timeZone: influencer.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        setLocalTime(time);
      } catch (e) {
        setLocalTime("--:--");
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [influencer.timezone]);

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Tooltip content="Back to portfolio">
          <IconButton
            onClick={() => navigate("/")}
            icon={<ArrowLeft className="w-5 h-5" />}
            variant="ghost"
          />
        </Tooltip>
        <div className="flex items-center gap-3">
          <img
            src={influencer.avatarUrl}
            alt={influencer.name}
            className="w-9 h-9 rounded-full object-cover ring-1 ring-white/20"
          />
          <div>
            <h2 className="font-bold text-sm text-white leading-none">
              {influencer.name}
            </h2>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge
                variant="primary"
                size="sm"
                icon={<MapPin className="w-3 h-3" />}
              >
                {influencer.location}
              </Badge>
              <Tooltip content="Plan a trip">
                <button
                  onClick={onTravelClick}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-gray-300 px-1.5 py-0.5 rounded ml-1 transition-colors"
                >
                  Travel
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
      <Tooltip content={`Local time in ${influencer.location}`}>
        <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
          <Clock className="w-3 h-3 text-indigo-400" />
          <span className="text-xs font-mono text-gray-300">{localTime}</span>
        </div>
      </Tooltip>
    </header>
  );
};

export default DashboardHeader;
