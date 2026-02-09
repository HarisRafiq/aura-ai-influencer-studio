import React, { useState } from "react";
import { Plane, Train, Car, Ship, Ticket } from "lucide-react";
import { Influencer } from "../../types";
import { Modal, Button } from "../ui";

interface TravelModalProps {
  influencer: Influencer;
  isOpen: boolean;
  onClose: () => void;
  onTravel: (
    destination: string,
    mode: string,
    createStory: boolean,
  ) => Promise<void>;
  isBooking: boolean;
}

interface LocationData {
  display_name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

const TravelModal: React.FC<TravelModalProps> = ({
  influencer,
  isOpen,
  onClose,
  onTravel,
  isBooking,
}) => {
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState("Plane");
  const [createStory, setCreateStory] = useState(false);

  if (!isOpen) return null;

  const handleTravel = () => {
    if (!destination.trim()) return;
    onTravel(destination, mode, createStory);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Plan a Trip"
      description={`Where should ${influencer.name} go next?`}
      icon={<Plane className="w-6 h-6" />}
    >
      <div className="space-y-4">
        <div>
           <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
            Destination
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Search for a destination..."
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
            Travel Mode
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "Plane", icon: Plane },
              { id: "Train", icon: Train },
              { id: "Car", icon: Car },
              { id: "Ship", icon: Ship },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${mode === m.id ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"}`}
              >
                <m.icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{m.id}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={createStory}
            onChange={(e) => setCreateStory(e.target.checked)}
            className="w-4 h-4 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
          />
          <span className="text-sm text-gray-300">
             Auto-generate travel post
          </span>
        </label>
      </div>

      <Button
        variant="primary"
        fullWidth
        onClick={handleTravel}
        disabled={!destination.trim()}
        loading={isBooking}
        icon={!isBooking && <Ticket className="w-4 h-4" />}
      >
        {isBooking
          ? "Updating..."
          : createStory
            ? "Book Trip & Create Story"
            : "Update Location"}
      </Button>
    </Modal>
  );
};

export default TravelModal;
