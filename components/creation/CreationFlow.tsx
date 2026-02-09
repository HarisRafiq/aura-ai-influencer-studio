import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
  Edit3,
  X,
} from "lucide-react";
import { Button, Spinner } from "../ui";
import { AvatarSelector } from "./AvatarSelector";
import {
  creationService,
  CreationSession,
  CreationStatus,
} from "../../services/creation";
import { useSSESubscription } from "../../services/sse";

interface CreationFlowProps {
  onComplete: (influencerId: string) => void;
  onCancel: () => void;
}

type Step =
  | "input"
  | "generating_images"
  | "select_avatar"
  | "generating_persona"
  | "review"
  | "complete";

const stepToStatus: Record<Step, CreationStatus[]> = {
  input: ["pending"],
  generating_images: ["pending", "generating_images"],
  select_avatar: ["images_ready"],
  generating_persona: ["generating_persona"],
  review: ["persona_ready"],
  complete: ["complete"],
};

export const CreationFlow: React.FC<CreationFlowProps> = ({
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<Step>("input");
  const [location, setLocation] = useState("");
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<CreationSession | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable persona fields
  const [editedName, setEditedName] = useState("");
  const [editedBio, setEditedBio] = useState("");
  const [editedNiches, setEditedNiches] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const suggestions = [
    {
      location: "New York, USA",
      prompt: "Fashion-forward street style influencer",
    },
    {
      location: "Tokyo, Japan",
      prompt: "Tech reviewer with minimal aesthetic",
    },
    {
      location: "Paris, France",
      prompt: "Elegant lifestyle and travel content creator",
    },
    {
      location: "Los Angeles, USA",
      prompt: "Fitness coach with positive energy",
    },
  ];

  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Subscribe to SSE updates for the current session
  useSSESubscription(
    session?.id ? `session:${session.id}` : null,
    useCallback((event, eventType) => {
      if (eventType === "status_update") {
        const { status, avatar_urls, persona, error: errMsg } = event.data;

        console.log("[CreationFlow] SSE update:", status);

        // Update session state
        setSession((prev) =>
          prev
            ? {
                ...prev,
                status,
                ...(avatar_urls && { avatar_urls }),
                ...(persona && { generated_persona: persona }),
                ...(errMsg && { error: errMsg }),
              }
            : null,
        );

        // Transition to appropriate step based on status
        if (status === "images_ready") {
          setStep("select_avatar");
        } else if (status === "persona_ready" && persona) {
          setEditedName(persona.name);
          setEditedBio(persona.bio);
          setEditedNiches(persona.niches);
          setStep("review");
        } else if (status === "failed") {
          setError(errMsg || "Creation failed");
        }
      }
    }, []),
  );

  // Check for active session on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const activeSession = await creationService.getActiveSession();
        if (activeSession) {
          setSession(activeSession);
          setLocation(activeSession.location);
          setPrompt(activeSession.prompt);

          // Restore to appropriate step based on status (SSE will handle updates)
          if (activeSession.status === "images_ready") {
            setStep("select_avatar");
          } else if (
            activeSession.status === "generating_images" ||
            activeSession.status === "pending"
          ) {
            setStep("generating_images");
            // SSE subscription will handle updates
          } else if (activeSession.status === "generating_persona") {
            setStep("generating_persona");
            setSelectedAvatar(activeSession.selected_avatar_url || null);
            // SSE subscription will handle updates
          } else if (activeSession.status === "persona_ready") {
            const persona = activeSession.generated_persona;
            if (persona) {
              setEditedName(persona.name);
              setEditedBio(persona.bio);
              setEditedNiches(persona.niches);
            }
            setSelectedAvatar(activeSession.selected_avatar_url || null);
            setStep("review");
          }
        }
      } catch (err) {
        console.error("Failed to check active session:", err);
      } finally {
        setIsLoadingSession(false);
      }
    };

    checkActiveSession();
  }, []);

  // Discard current session and start over
  const handleDiscard = async () => {
    if (!session) return;

    try {
      await creationService.discardSession(session.id);
      setSession(null);
      setStep("input");
      setLocation("");
      setPrompt("");
      setSelectedAvatar(null);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Start creation
  const handleStart = async () => {
    if (!location.trim() || !prompt.trim()) return;

    setError(null);
    setStep("generating_images");

    try {
      const newSession = await creationService.startCreation(
        location.trim(),
        prompt.trim(),
      );
      setSession(newSession);
      // SSE subscription will handle status updates
    } catch (err: any) {
      setError(err.message);
      setStep("input");
    }
  };

  // Select avatar
  const handleSelectAvatar = async () => {
    if (!session || !selectedAvatar) return;

    setStep("generating_persona");
    setError(null);

    try {
      await creationService.selectAvatar(session.id, selectedAvatar);
      // SSE subscription will handle persona generation updates
    } catch (err: any) {
      setError(err.message);
      setStep("select_avatar");
    }
  };

  // Confirm creation
  const handleConfirm = async () => {
    if (!session) return;

    setError(null);

    try {
      const result = await creationService.confirmCreation(session.id, {
        name: editedName,
        bio: editedBio,
        niches: editedNiches,
      });

      setStep("complete");
      onComplete(result.influencer.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const useSuggestion = (sug: (typeof suggestions)[0]) => {
    setLocation(sug.location);
    setPrompt(sug.prompt);
  };

  // Show loading spinner while checking for active session
  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#030014]">
        <Spinner size="lg" label="Loading..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#030014]">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px] opacity-20 animate-pulse" />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600 rounded-full blur-[120px] opacity-20 animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      {/* Close Button */}
      <button
        onClick={onCancel}
        className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all z-20"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="max-w-lg w-full z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
            Create{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Influencer
            </span>
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            {step === "input" && "Set their home base and describe their vibe."}
            {step === "generating_images" && "Generating avatar options..."}
            {step === "select_avatar" && "Choose the perfect look."}
            {step === "generating_persona" && "Crafting their personality..."}
            {step === "review" && "Review and customize their profile."}
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="space-y-6">
            {/* Location Input */}
            <div>
              <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">
                <MapPin className="w-3 h-3 inline mr-1" />
                Home Base
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., New York, Tokyo, Paris..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                autoFocus
              />
            </div>

            {/* Prompt Input */}
            <div>
              <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">
                <Sparkles className="w-3 h-3 inline mr-1" />
                Describe Their Vibe
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., A minimalist tech reviewer with a love for clean design..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
              />
            </div>

            {/* Start Button */}
            <Button
              onClick={handleStart}
              disabled={!location.trim() || !prompt.trim()}
              variant="primary"
              size="lg"
              className="w-full"
              icon={<ArrowRight className="w-5 h-5" />}
            >
              Generate Avatars
            </Button>

            {/* Suggestions */}
            <div className="pt-4">
              <p className="text-xs text-gray-600 font-bold uppercase tracking-widest mb-3">
                Quick Start
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => useSuggestion(sug)}
                    className="text-left text-xs text-gray-400 p-3 rounded-xl border border-white/5 hover:bg-white/5 hover:border-white/10 hover:text-white transition-all bg-gray-900/40"
                  >
                    <span className="font-medium text-indigo-400">
                      {sug.location}
                    </span>
                    <p className="mt-1 line-clamp-2 opacity-70">{sug.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Generating Images */}
        {step === "generating_images" && (
          <div className="py-16 flex flex-col items-center justify-center">
            <Spinner size="lg" />
            <p className="mt-6 text-gray-400 text-center">
              Creating unique avatar options...
              <br />
              <span className="text-xs text-gray-600">
                This may take a minute.
              </span>
            </p>
            {session && (
              <Button
                onClick={handleDiscard}
                variant="ghost"
                size="sm"
                className="mt-6 text-gray-500"
              >
                Discard & Start Over
              </Button>
            )}
          </div>
        )}

        {/* Step 3: Avatar Selection */}
        {step === "select_avatar" && session && (
          <div className="space-y-6">
            <AvatarSelector
              images={session.avatar_urls}
              selectedHash={selectedAvatar}
              onSelect={setSelectedAvatar}
            />

            <div className="flex gap-3">
              <Button
                onClick={handleDiscard}
                variant="ghost"
                size="md"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Start Over
              </Button>
              <Button
                onClick={handleSelectAvatar}
                disabled={!selectedAvatar}
                variant="primary"
                size="md"
                className="flex-1"
                icon={<ArrowRight className="w-5 h-5" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Generating Persona */}
        {step === "generating_persona" && (
          <div className="py-16 flex flex-col items-center justify-center">
            {selectedAvatar && (
              <img
                src={selectedAvatar}
                alt="Selected Avatar"
                className="w-24 h-24 rounded-full object-cover ring-4 ring-indigo-500/30 mb-6"
              />
            )}
            <Spinner size="lg" />
            <p className="mt-6 text-gray-400 text-center">
              Crafting their unique personality...
            </p>
          </div>
        )}

        {/* Step 5: Review & Confirm */}
        {step === "review" && session?.generated_persona && (
          <div className="space-y-6">
            {/* Avatar Preview */}
            <div className="flex items-center gap-4">
              <img
                src={session.selected_avatar_url}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover ring-2 ring-indigo-500/30"
              />
              <div className="flex-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-white">{editedName}</h2>
                )}
                <p className="text-sm text-indigo-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {session.location}
                </p>
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`p-2 rounded-lg transition-colors ${isEditing ? "bg-indigo-500 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            {/* Bio */}
            <div>
              <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">
                Bio
              </label>
              {isEditing ? (
                <textarea
                  value={editedBio}
                  onChange={(e) => setEditedBio(e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              ) : (
                <p className="text-gray-300 bg-white/5 rounded-xl px-4 py-3">
                  {editedBio}
                </p>
              )}
            </div>

            {/* Niches */}
            <div>
              <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">
                Niches
              </label>
              <div className="flex flex-wrap gap-2">
                {editedNiches.map((niche, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-sm border border-indigo-500/30"
                  >
                    {niche}
                    {isEditing && (
                      <button
                        onClick={() =>
                          setEditedNiches(
                            editedNiches.filter((_, i) => i !== idx),
                          )
                        }
                        className="ml-2 text-indigo-400 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => {
                  setStep("select_avatar");
                  setSelectedAvatar(null);
                }}
                variant="ghost"
                size="md"
                icon={<ArrowLeft className="w-4 h-4" />}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                variant="primary"
                size="lg"
                className="flex-1"
                icon={<Check className="w-5 h-5" />}
              >
                Create Influencer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreationFlow;
