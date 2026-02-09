import React, { useRef, useState, useEffect } from "react";
import { Post, Influencer, PostCreationStatus } from "../types";
import {
  BadgeCheck,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  Sparkles,
  FolderDown,
  Film,
  Loader2,
  AlertCircle,
} from "lucide-react";
import IconButton from "./ui/IconButton";
import Tooltip from "./ui/Tooltip";
import { api } from "../services/api";
import { useSSESubscription } from "../services/sse";

interface FeedProps {
  posts: Post[];
  influencer: Influencer;
}

export const Feed: React.FC<FeedProps> = ({ posts, influencer }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCaption = async (post: Post) => {
    const text = `${post.content}\n\n${post.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleDownloadImage = async (url: string, filename: string) => {
    try {
      // Add cache busting to force browser to ignore cached copy without CORS headers
      const cacheBustedUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      const response = await fetch(cacheBustedUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Download with fetch failed, falling back to new tab:", err);
      window.open(url, "_blank");
    }
  };

  const drawWithCaptions = (url: string, caption: string, filename: string) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject("Could not get canvas context");
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const gradientHeight = canvas.height * 0.3;
        const gradient = ctx.createLinearGradient(
          0,
          canvas.height - gradientHeight,
          0,
          canvas.height,
        );
        gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.4)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
        ctx.fillStyle = gradient;
        ctx.fillRect(
          0,
          canvas.height - gradientHeight,
          canvas.width,
          gradientHeight,
        );

        const padding = canvas.width * 0.08;
        const fontSize = Math.max(16, Math.floor(canvas.width / 30));
        ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`;
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";

        const maxWidth = canvas.width - padding * 2;
        const words = caption.split(" ");
        let line = "";
        const lines = [];

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const metrics = ctx.measureText(testLine);
          const testWidth = metrics.width;
          if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + " ";
          } else {
            line = testLine;
          }
        }
        lines.push(line);

        const lineHeight = fontSize * 1.4;
        let y = canvas.height - padding - 20;

        for (let i = lines.length - 1; i >= 0; i--) {
          ctx.fillText(lines[i], padding, y);
          y -= lineHeight;
        }

        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
      };
      img.onerror = () => reject("Failed to load image");
      // Add cache busting for canvas drawing as well
      const cacheBustedUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      img.src = cacheBustedUrl;
    });
  };

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 rotate-12 border border-white/10">
          <Share2 className="w-10 h-10 text-indigo-400/50" />
        </div>
        <h3 className="text-2xl font-semibold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          No posts created
        </h3>
        <p className="text-gray-400 mt-2 max-w-xs">
          Use the Director agent to generate your first influencer story.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[500px] mx-auto space-y-12 pb-32">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          influencer={influencer}
          onCopy={handleCopyCaption}
          onDownload={handleDownloadImage}
          onDownloadWithCaptions={drawWithCaptions}
          isCopied={copiedId === post.id}
        />
      ))}
    </div>
  );
};

interface PostCardProps {
  post: Post;
  influencer: Influencer;
  onCopy: (post: Post) => void;
  onDownload: (url: string, filename: string) => void;
  onDownloadWithCaptions: (
    url: string,
    caption: string,
    filename: string,
  ) => Promise<void>;
  isCopied: boolean;
}

const formatRelativeTime = (date: Date | string | number) => {
  const d = new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return d.toLocaleDateString();
};

const PostCard: React.FC<PostCardProps> = ({
  post,
  influencer,
  onCopy,
  onDownload,
  onDownloadWithCaptions,
  isCopied,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [videoProgress, setVideoProgress] = useState<string>("");
  const [showVideo, setShowVideo] = useState(false);

  const slides = post.slides || [];

  // Check if post is still being generated or processing video
  const isGenerating =
    post.status &&
    [
      PostCreationStatus.PENDING,
      PostCreationStatus.GENERATING_STORY,
      PostCreationStatus.GENERATING_IMAGES,
    ].includes(post.status);

  const isGeneratingVideo = post.status === PostCreationStatus.GENERATING_VIDEO;
  const isVideoReady = post.status === PostCreationStatus.VIDEO_READY;
  const isFailed =
    post.status === PostCreationStatus.FAILED ||
    post.status === PostCreationStatus.VIDEO_FAILED;

  const hasVideos = post.videoUrls && post.videoUrls.length > 0;
  
  const [isBuffering, setIsBuffering] = useState(false);

  // Auto-enable video mode when videos become ready
  useEffect(() => {
    if (isVideoReady || hasVideos) {
      setShowVideo(true);
    }
  }, [isVideoReady, hasVideos]);

  // Handle autoplay when active slide changes
  useEffect(() => {
    if (showVideo) {
      // Reset buffering state on slide change
      setIsBuffering(true);
      
      videoRefs.current.forEach((video, index) => {
        if (video) {
          if (index === activeSlide) {
            video.currentTime = 0;
            const playPromise = video.play();
            if (playPromise !== undefined) {
               playPromise
               .then(() => {
                  // Playback started successfully
                  setIsBuffering(false);
               })
               .catch(e => {
                  console.log("Autoplay blocked/failed:", e);
                  setIsBuffering(false);
               });
            }
          } else {
            video.pause();
          }
        }
      });
    }
  }, [activeSlide, showVideo, slides]);

  const canGenerateVideo =
    slides.length > 1 &&
    !hasVideos &&
    !isGeneratingVideo &&
    !isGenerating &&
    !isVideoReady;

  useSSESubscription(
    `post:${post.id}`,
    (event, eventType) => {
      if (
        eventType === "status_update" ||
        eventType === "video_status"
      ) {
        const { status, message, videoUrls } = event.data;

        console.log(`[Post SSE] ${post.id} Status update: ${status}`);

        if (
          status === PostCreationStatus.GENERATING_VIDEO ||
          status === "processing"
        ) {
          setVideoProgress(message || "Processing...");
        } else {
          setVideoProgress("");
        }

        if (status === PostCreationStatus.VIDEO_READY && videoUrls) {
           setShowVideo(true);
        }
      }
    },
    isGenerating || isGeneratingVideo,
  );

  const handleGenerateVideo = async () => {
    if (!canGenerateVideo) return;

    setVideoProgress("Starting video generation...");
    
    // Optimistically disable the button to prevent double clicks
    // Triggered re-render will handle UI update

    try {
      const response = await api.post(
        `/postings/${post.id}/generate-videos?duration=5&aspect_ratio=9:16`,
      );

      if (response.data.success) {
        console.log("Video generation started:", response.data.message);
      }
    } catch (error: any) {
      console.error("Failed to start video generation:", error);
      setVideoProgress("");

      if (error.response?.data?.detail) {
        alert(`Video generation failed: ${error.response.data.detail}`);
      }
    }
  };

  const getVideoForSlide = (slideIndex: number) => {
    return post.videoUrls?.find((v) => v.slideIndex === slideIndex);
  };

  const handleDownloadAll = async (withCaptions: boolean) => {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const filename = `aura-${post.id}-slide-${i + 1}.png`;
      if (withCaptions) {
        await onDownloadWithCaptions(slide.imageUrl, slide.caption, filename);
      } else {
        await onDownload(slide.imageUrl, filename);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const index = Math.round(
        scrollRef.current.scrollLeft / scrollRef.current.offsetWidth,
      );
      if (index !== activeSlide) {
        setActiveSlide(index);
      }
    }
  };

  return (
    <div className="relative w-full max-w-[420px] mx-auto mb-8 rounded-2xl overflow-hidden shadow-2xl bg-black aspect-[9/16]">
      {/* 
        TIKTOK STYLE LAYOUT 
        Everything is absolute overlaid on top of the media.
      */}

      {/* --- Top Left: User Info --- */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <img
            src={influencer.avatarUrl}
            alt={influencer.name}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20 shadow-lg"
          />
          <div className="flex flex-col drop-shadow-md">
            <span className="text-sm font-bold text-white leading-none">
              {influencer.name}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
               {post.location && (
                <span className="text-[10px] text-white/90 font-medium bg-white/10 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {post.location}
                </span>
              )}
               <span className="text-[10px] text-white/70">
                • {formatRelativeTime(post.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Right Side: Actions --- */}
      <div className="absolute right-4 bottom-24 z-20 flex flex-col gap-4 items-center">
        {/* Toggle Video/Image */}
        {(hasVideos || isVideoReady) && (
          <Tooltip content={showVideo ? "Show Images" : "Play Video"} side="left">
             <button
               onClick={() => setShowVideo(!showVideo)}
               className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all hover:bg-black/60 hover:scale-110"
             >
                <Film className={`w-5 h-5 ${showVideo ? "text-pink-400" : "text-white"}`} />
             </button>
          </Tooltip>
        )}

        {/* Generate Video Action */}
        {canGenerateVideo && (
           <Tooltip content="Generate Videos" side="left">
             <button
               onClick={handleGenerateVideo}
               className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all hover:bg-black/60 hover:scale-110 group"
             >
                <Film className="w-5 h-5 text-white group-hover:text-pink-400 transition-colors" />
             </button>
           </Tooltip>
        )}

        {/* Processing Spinner */}
        {isGeneratingVideo && (
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
               <Loader2 className="w-5 h-5 text-pink-400 animate-spin" />
            </div>
        )}

        {/* Download Slide */}
        <Tooltip content="Download" side="left">
           <button
             onClick={() => onDownload(
               slides[activeSlide].imageUrl,
               `aura-${post.id}-slide-${activeSlide + 1}.png`,
             )}
             className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all hover:bg-black/60 hover:scale-110"
           >
              <Download className="w-5 h-5" />
           </button>
        </Tooltip>

         {/* Download All */}
         {slides.length > 1 && (
            <Tooltip content="Download All" side="left">
               <button
                 onClick={() => handleDownloadAll(false)}
                 className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all hover:bg-black/60 hover:scale-110"
               >
                  <FolderDown className="w-5 h-5 text-indigo-300" />
               </button>
            </Tooltip>
         )}

         {/* Copy Caption */}
        <Tooltip content={isCopied ? "Copied!" : "Copy Caption"} side="left">
           <button
             onClick={() => onCopy(post)}
             className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all hover:bg-black/60 hover:scale-110"
           >
              {isCopied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
           </button>
        </Tooltip>
      </div>

      {/* --- Main Content Area --- */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
      >
         {/* Generation/Error Overlays */}
         {(isGenerating || isFailed) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/90 backdrop-blur-sm">
               <div className="text-center px-6 py-8 max-w-xs">
               {isFailed ? (
                 <>
                   <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                   <h3 className="text-white font-semibold text-lg mb-2">Generation Failed</h3>
                   <p className="text-gray-400 text-sm">{post.error || "An error occurred"}</p>
                 </>
               ) : (
                 <>
                   <Loader2 className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-spin" />
                   <h3 className="text-white font-semibold text-lg mb-2">
                     {post.status === PostCreationStatus.GENERATING_STORY && "Writing Story..."}
                     {post.status === PostCreationStatus.GENERATING_IMAGES && "Generating Images..."}
                     {post.status === PostCreationStatus.GENERATING_VIDEO && "Generating Video..."}
                     {post.status === PostCreationStatus.PENDING && "Starting..."}
                   </h3>
                   <p className="text-gray-400 text-sm">
                     {post.status === PostCreationStatus.GENERATING_VIDEO
                       ? videoProgress || "Preparing scenes..."
                       : post.prompt && `"${post.prompt.substring(0, 60)}..."`}
                   </p>
                 </>
               )}
               </div>
            </div>
         )}
         
         {/* Video Buffering Indicator */}
         {showVideo && isBuffering && !isGenerating && !isFailed && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="bg-black/30 backdrop-blur-sm p-3 rounded-full">
                <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
              </div>
            </div>
         )}

         {slides.length > 0 ? (
            slides.map((slide, idx) => {
               const videoSlide = showVideo ? getVideoForSlide(idx) : null;
               const shouldShowVideo = showVideo && videoSlide;

               return (
                  <div key={idx} className="w-full flex-shrink-0 snap-center relative h-full">
                     {shouldShowVideo ? (
                        <video
                           ref={(el) => {
                             if (el) videoRefs.current[idx] = el;
                           }}
                           src={videoSlide.videoUrl}
                           className="w-full h-full object-cover"
                           controls={false}
                           muted
                           playsInline
                           onWaiting={() => setIsBuffering(true)}
                           onPlaying={() => setIsBuffering(false)}
                           onCanPlay={() => {
                             if (idx === activeSlide) setIsBuffering(false);
                           }}
                        />
                     ) : (
                        <img
                           src={slide.imageUrl}
                           alt={`Slide ${idx + 1}`}
                           className="w-full h-full object-cover"
                        />
                     )}
                     
                     {/* Gradient Overlay for Text Readability */}
                     <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
                  </div>
               );
            })
         ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
               <Sparkles className="w-16 h-16 text-gray-700" />
            </div>
         )}
      </div>

      {/* --- Bottom: Captions & Pagination --- */}
      <div className="absolute bottom-0 left-0 right-16 z-20 p-4 pb-6 pointer-events-none">
         <div className="pointer-events-auto">
            {/* Active Slide Caption */}
            {slides.length > 0 && (
               <p className="text-white text-sm font-medium leading-relaxed drop-shadow-md line-clamp-3 mb-3">
                  {slides[activeSlide]?.caption}
               </p>
            )}

            {/* Pagination Dots */}
            {slides.length > 1 && (
               <div className="flex gap-1.5 mt-2">
                  {slides.map((_, idx) => (
                     <div
                        key={idx}
                        className={`transition-all duration-300 rounded-full shadow-sm ${
                           activeSlide === idx ? "bg-white w-5 h-1.5" : "bg-white/40 w-1.5 h-1.5"
                        }`}
                     />
                  ))}
               </div>
            )}
         </div>
      </div>
    </div>
  );
};
