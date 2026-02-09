import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInfluencers } from "../services/InfluencerContext";
import { useToast } from "../services/ToastContext";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import ControlBar from "../components/dashboard/ControlBar";
import PostCreator from "../components/dashboard/PostCreator";
import TravelModal from "../components/dashboard/TravelModal";
import AgentModal from "../components/dashboard/AgentModal";
import { OrchestratorFlow } from "../components/orchestrator/OrchestratorFlow";
import { Feed } from "../components/Feed";
import { ArrowLeft } from "lucide-react";

type ViewMode = "feed" | "explore";

const DashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getInfluencer, getPosts, travelInfluencer } = useInfluencers();
  const { showToast } = useToast();

  const influencer = getInfluencer(id || "");
  const posts = getPosts(id || "");

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("feed");

  // Modal state
  const [isPostCreatorOpen, setIsPostCreatorOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState(""); // For passing context like Travel
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isOrchestratorOpen, setIsOrchestratorOpen] = useState(false);
  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);

  if (!influencer) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold text-white mb-4">
          Influencer not found
        </h2>
        <button
          onClick={() => navigate("/")}
          className="text-purple-400 font-medium"
        >
          Return Home
        </button>
      </div>
    );
  }

  const handleTravel = async (
    destination: string,
    mode: string,
    createStory: boolean,
  ) => {
    if (!destination.trim()) return;

    try {
      // Call travel API to update location and geocoding data immediately
      await travelInfluencer(influencer.id, destination, mode, createStory);

      setIsTravelModalOpen(false);

      // Toast notifications are now handled within InfluencerContext's SSE listener
      // or we can add a simple one here for immediate feedback
      if (!createStory) {
        showToast(`${influencer.name} is now in ${destination}!`, "success");
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to update location.", "error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <DashboardHeader
        influencer={influencer}
        onTravelClick={() => setIsTravelModalOpen(true)}
      />

      {/* Navigation and Back Button */}
      {viewMode === "explore" && (
        <div className="p-4">
          <button
            onClick={() => setViewMode("feed")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="font-medium">Back to Feed</span>
          </button>
        </div>
      )}

      <ControlBar
        onClicked={() => {
          setInitialPrompt("");
          setIsPostCreatorOpen(true);
        }}
        onAgentClicked={() => setIsAgentModalOpen(true)}
        onOrchestratorClicked={() => setIsOrchestratorOpen(true)}
      />

      {/* Main Content Area */}
      <div className="min-h-[60vh] px-4 space-y-8 mt-6">
        <Feed posts={posts} influencer={influencer} />
      </div>

      {/* Modals */}
      <PostCreator
        influencer={influencer}
        isOpen={isPostCreatorOpen}
        onClose={() => setIsPostCreatorOpen(false)}
        initialPrompt={initialPrompt}
        onPostCreated={() => {
          // Post is already injected into state by PostCreator
          setIsPostCreatorOpen(false);
        }}
      />

      <OrchestratorFlow
        influencerId={influencer.id}
        isOpen={isOrchestratorOpen}
        onClose={() => setIsOrchestratorOpen(false)}
        onComplete={(postData) => {
          showToast("Post generated successfully!", "success");
          setIsOrchestratorOpen(false);
        }}
      />

      <TravelModal
        influencer={influencer}
        isOpen={isTravelModalOpen}
        onClose={() => setIsTravelModalOpen(false)}
        onTravel={handleTravel}
        isBooking={false}
      />
    </div>
  );
};

export default DashboardPage;
