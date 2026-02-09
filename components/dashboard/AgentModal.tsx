import React, { useState, useEffect, useRef } from "react";
import { X, Sparkles, Loader2, Send, Search, Book, MessageCircle, Check, Image } from "lucide-react";
import { useToast } from "../../services/ToastContext";
import { agentService, AutonomousSession } from "../../services/agent";
import { useInfluencers } from "../../services/InfluencerContext";
import { Influencer } from "../../types";
import { getSSEManager } from "../../services/sse";
import { getPost } from "../../services/post_creation";

interface AgentModalProps {
  influencer: Influencer;
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
}

interface AgentEvent {
  type: 'thinking' | 'research' | 'search' | 'image_search' | 'read' | 'ask_user' | 'creating' | 'complete' | 'error';
  thought?: string;
  query?: string;
  queries?: string[];
  url?: string;
  question?: string;
  message?: string;
  summary?: string;
  status?: 'running' | 'complete' | 'waiting';
  iteration?: number;
  imageCount?: number;
}

interface CarouselContent {
  caption: string;
  slides: Array<{
    caption: string;
    visual_scene: string;
  }>;
}

const AgentModal: React.FC<AgentModalProps> = ({
  influencer,
  isOpen,
  onClose,
  onPostCreated,
}) => {
  const { showToast } = useToast();
  const { injectPost } = useInfluencers();

  // State
  const [goal, setGoal] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [userResponse, setUserResponse] = useState("");
  const [carousel, setCarousel] = useState<CarouselContent | null>(null);
  const [isGeneratingPost, setIsGeneratingPost] = useState(false);

  const eventsEndRef = useRef<HTMLDivElement>(null);
  const sseUnsubscribeRef = useRef<(() => void) | null>(null);

  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events, pendingQuestion]);

  useEffect(() => {
    if (!isOpen) {
      // Cleanup SSE on close
      if (sseUnsubscribeRef.current) {
        sseUnsubscribeRef.current();
        sseUnsubscribeRef.current = null;
      }
    }
  }, [isOpen]);

  const resetState = () => {
    setGoal("");
    setSessionId(null);
    setIsRunning(false);
    setEvents([]);
    setPendingQuestion(null);
    setUserResponse("");
    setCarousel(null);
    setIsGeneratingPost(false);
    
    if (sseUnsubscribeRef.current) {
      sseUnsubscribeRef.current();
      sseUnsubscribeRef.current = null;
    }
  };

  const subscribeToSSE = (sessId: string) => {
    const sseManager = getSSEManager();
    const unsubscribe = sseManager.subscribe(
      `agent:${sessId}`,
      (event, eventType) => {
        console.log('[AgentModal] SSE Event:', eventType, event.data);
        
        if (eventType === "agent_thinking") {
          // Agent is thinking about what to do next
          setEvents(prev => [...prev, {
            type: 'thinking',
            thought: event.data.thought,
            iteration: event.data.iteration
          }]);
        } else if (eventType === "agent_action") {
          // Agent is doing something
          const actionData = event.data;
          
          if (actionData.type === 'research') {
            // Unified research action (web + image search)
            setEvents(prev => {
              const lastEvent = prev[prev.length - 1];
              const queriesStr = (actionData.queries || []).join(', ');
              if (lastEvent && lastEvent.type === 'research' && actionData.status === 'complete') {
                // Update existing
                return [...prev.slice(0, -1), { 
                  ...lastEvent, 
                  summary: actionData.summary, 
                  imageCount: actionData.image_count,
                  status: 'complete' 
                }];
              }
              return [...prev, {
                type: 'research',
                queries: actionData.queries,
                summary: actionData.summary,
                imageCount: actionData.image_count,
                status: actionData.status
              }];
            });
          } else if (actionData.type === 'search') {
            // Legacy search handler
            setEvents(prev => [...prev, {
              type: 'search',
              query: actionData.query,
              summary: actionData.summary,
              status: actionData.status
            }]);
          } else if (actionData.type === 'image_search') {
            // Legacy image search handler
            setEvents(prev => [...prev, {
              type: 'image_search',
              query: actionData.query,
              imageCount: actionData.image_count,
              status: actionData.status
            }]);
          } else if (actionData.type === 'read') {
            setEvents(prev => [...prev, {
              type: 'read',
              url: actionData.url,
              summary: actionData.summary,
              status: actionData.status
            }]);
          } else if (actionData.type === 'ask_user') {
            setPendingQuestion(actionData.question);
            setIsRunning(false);
          } else if (actionData.type === 'creating') {
            setEvents(prev => [...prev, {
              type: 'creating',
              message: actionData.message,
              status: actionData.status
            }]);
          }
        } else if (eventType === "agent_question") {
          // Agent needs user input
          setPendingQuestion(event.data.question);
          setIsRunning(false);
        } else if (eventType === "agent_complete") {
          // Agent finished
          setIsRunning(false);
          setCarousel(event.data.carousel);
          setEvents(prev => [...prev, {
            type: 'complete',
            message: 'Content ready!'
          }]);
        } else if (eventType === "agent_error") {
          setIsRunning(false);
          setEvents(prev => [...prev, {
            type: 'error',
            message: event.data.error
          }]);
          showToast(event.data.error || "An error occurred", "error");
        }
      }
    );
    
    sseUnsubscribeRef.current = unsubscribe;
  };

  const handleStartAgent = async () => {
    if (!goal.trim()) return;

    setIsRunning(true);
    setEvents([]);
    setCarousel(null);
    setPendingQuestion(null);

    try {
      const response = await agentService.startAutonomous({
        influencer_id: influencer.id,
        goal: goal.trim(),
      });

      setSessionId(response.session_id);
      subscribeToSSE(response.session_id);
    } catch (error) {
      console.error("Failed to start agent:", error);
      showToast("Failed to start agent", "error");
      setIsRunning(false);
    }
  };

  const handleRespondToQuestion = async () => {
    if (!sessionId || !userResponse.trim()) return;

    setIsRunning(true);
    setPendingQuestion(null);
    
    // Add user response to events
    setEvents(prev => [...prev, {
      type: 'thinking',
      thought: `User said: "${userResponse}"`
    }]);

    try {
      await agentService.respondToAgent(sessionId, userResponse.trim());
      setUserResponse("");
    } catch (error) {
      console.error("Failed to respond:", error);
      showToast("Failed to send response", "error");
      setIsRunning(false);
    }
  };

  const handleGeneratePost = async () => {
    if (!sessionId || !carousel) return;

    setIsGeneratingPost(true);

    try {
      const response = await agentService.generatePostFromSession(sessionId);
      
      // Fetch the post and inject it
      const post = await getPost(response.post_id);
      injectPost(influencer.id, post);

      showToast("Post generation started!", "success");
      onPostCreated();
      onClose();
    } catch (error) {
      console.error("Failed to generate post:", error);
      showToast("Failed to generate post", "error");
      setIsGeneratingPost(false);
    }
  };

  const getEventIcon = (type: AgentEvent['type']) => {
    switch (type) {
      case 'thinking':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'research':
        return <Search className="w-4 h-4 text-emerald-400" />;
      case 'search':
        return <Search className="w-4 h-4 text-blue-400" />;
      case 'image_search':
        return <Image className="w-4 h-4 text-cyan-400" />;
      case 'read':
        return <Book className="w-4 h-4 text-green-400" />;
      case 'ask_user':
        return <MessageCircle className="w-4 h-4 text-yellow-400" />;
      case 'creating':
        return <Sparkles className="w-4 h-4 text-pink-400" />;
      case 'complete':
        return <Check className="w-4 h-4 text-green-400" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900/60 backdrop-blur-md border border-white/10 shadow-xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <div>
              <h2 className="text-xl font-bold">AI Content Agent</h2>
              <p className="text-sm text-gray-400">
                Tell me what you want to post about
              </p>
            </div>
          </div>
          <button
            onClick={() => { resetState(); onClose(); }}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 h-[500px] overflow-y-auto">
          {/* Goal Input */}
          {!sessionId && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <p className="text-gray-300 text-lg">
                  What do you want to post about?
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Be specific - I'll research and create authentic content
                </p>
              </div>

              <div className="space-y-3">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g., Review that new ramen place on 5th Ave, Share my thoughts on the iPhone 17 AI features, Best hiking trails near Brooklyn..."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                />
                <button
                  onClick={handleStartAgent}
                  disabled={!goal.trim()}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-5 h-5" />
                  Start Creating
                </button>
              </div>

              {/* Suggestions */}
              <div className="mt-6">
                <p className="text-xs text-gray-500 mb-2">Quick ideas:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Review a local café",
                    "Share a product find",
                    "Cover a recent event",
                    "Travel recommendation",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setGoal(suggestion)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-gray-400 hover:text-white transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Agent Running */}
          {sessionId && (
            <div className="space-y-4">
              {/* Goal Display */}
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-4">
                <p className="text-sm text-purple-300">
                  <span className="font-medium">Creating:</span> {goal}
                </p>
              </div>

              {/* Event Feed */}
              <div className="space-y-3">
                {events.map((event, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      event.type === 'complete' ? 'bg-green-500/10 border border-green-500/20' :
                      event.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                      'bg-white/5'
                    }`}
                  >
                    <div className="mt-0.5">
                      {event.status === 'running' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        getEventIcon(event.type)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {event.type === 'thinking' && (
                        <p className="text-sm text-gray-300">{event.thought}</p>
                      )}
                      {event.type === 'research' && (
                        <div>
                          <p className="text-sm text-emerald-300">
                            🔍 Researching: {event.queries?.slice(0, 2).map((q: string) => `"${q}"`).join(', ')}
                            {event.queries && event.queries.length > 2 && '...'}
                          </p>
                          {event.status === 'complete' && (
                            <p className="text-xs text-gray-400 mt-1">
                              Found results + {event.imageCount || 0} images
                            </p>
                          )}
                          {event.summary && (
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {event.summary}
                            </p>
                          )}
                        </div>
                      )}
                      {event.type === 'search' && (
                        <div>
                          <p className="text-sm text-blue-300">
                            Searching: "{event.query}"
                          </p>
                          {event.summary && (
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {event.summary}
                            </p>
                          )}
                        </div>
                      )}
                      {event.type === 'image_search' && (
                        <div>
                          <p className="text-sm text-cyan-300">
                            🖼️ Image search: "{event.query}"
                          </p>
                          {event.imageCount && event.imageCount > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              Found {event.imageCount} images for reference
                            </p>
                          )}
                        </div>
                      )}
                      {event.type === 'read' && (
                        <p className="text-sm text-green-300 truncate">
                          Reading: {event.url}
                        </p>
                      )}
                      {event.type === 'creating' && (
                        <p className="text-sm text-pink-300">{event.message}</p>
                      )}
                      {event.type === 'complete' && (
                        <p className="text-sm text-green-300 font-medium">
                          ✨ {event.message}
                        </p>
                      )}
                      {event.type === 'error' && (
                        <p className="text-sm text-red-300">{event.message}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Running indicator */}
                {isRunning && (
                  <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span className="text-sm text-gray-400">Thinking...</span>
                  </div>
                )}

                <div ref={eventsEndRef} />
              </div>

              {/* Question Input */}
              {pendingQuestion && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-3">
                  <p className="text-sm text-yellow-300">
                    <MessageCircle className="w-4 h-4 inline mr-2" />
                    {pendingQuestion}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userResponse}
                      onChange={(e) => setUserResponse(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && userResponse.trim()) {
                          handleRespondToQuestion();
                        }
                      }}
                      placeholder="Your response..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    />
                    <button
                      onClick={handleRespondToQuestion}
                      disabled={!userResponse.trim()}
                      className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Carousel Preview */}
              {carousel && (
                <div className="p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl space-y-4">
                  <h3 className="font-semibold text-purple-300">📸 Preview</h3>
                  
                  <div className="space-y-2">
                    <p className="text-sm text-white">{carousel.caption}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {carousel.slides.map((slide, idx) => (
                      <div 
                        key={idx}
                        className="p-2 bg-white/5 rounded-lg"
                      >
                        <p className="text-xs text-gray-400 mb-1">Slide {idx + 1}</p>
                        <p className="text-sm text-white">{slide.caption}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleGeneratePost}
                    disabled={isGeneratingPost}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingPost ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Images...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Post
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentModal;
