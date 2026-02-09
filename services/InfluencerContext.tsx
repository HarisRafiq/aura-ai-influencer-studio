import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Influencer, Post, PostCreationStatus } from "../types";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { getSSEManager } from "./sse";
import { useToast } from "./ToastContext";

interface InfluencerContextType {
  influencers: Influencer[];
  posts: Record<string, Post[]>;
  addInfluencer: (influencer: Omit<Influencer, "id">) => Promise<string>;
  updateInfluencer: (influencer: Influencer) => Promise<void>;
  addPost: (influencerId: string, post: Omit<Post, "id">) => Promise<void>;
  generatePost: (influencerId: string, prompt: string) => Promise<void>;
  injectPost: (influencerId: string, post: Post) => void;
  getInfluencer: (id: string) => Influencer | undefined;
  getPosts: (influencerId: string) => Post[];
  refreshData: () => Promise<void>;
  travelInfluencer: (
    id: string,
    destination: string,
    mode: string,
    createStory: boolean,
  ) => Promise<any>;
}

const InfluencerContext = createContext<InfluencerContextType | undefined>(
  undefined,
);

export const InfluencerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [posts, setPosts] = useState<Record<string, Post[]>>({});
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const fetchData = async () => {
    if (!isAuthenticated) return;
    try {
      // Fetch Influencers
      const res = await api.fetchInfluencers();
      const fetchedInfluencers = res.map((e: any) => ({
        ...e.data,
        id: e.id,
      }));
      setInfluencers(fetchedInfluencers);

      // Fetch all posts for each influencer
      for (const inf of fetchedInfluencers) {
        const postsRes = await api.fetchPostings(inf.id);
        const fetchedPosts = postsRes.map((e: any) => {
          const data = e.data;
          let slides = [];

          // Handle image_slides format (new with status)
          if (data.image_slides && data.image_slides.length > 0) {
            slides = data.image_slides.map((slide: any) => ({
              imageUrl: slide.imageUrl || slide.image_url,
              caption: slide.caption,
              imagePrompt: "",
              videoUrl: undefined,
            }));
          }
          // Handle multi-image format (image_urls array)
          else if (data.image_urls && data.image_urls.length > 0) {
            slides = data.image_urls.map((url: string, index: number) => ({
              imageUrl: url,
              caption:
                data.generated_content?.slides?.[index]?.caption ||
                data.stories_text?.[index] ||
                data.content ||
                "",
              imagePrompt: "",
              videoUrl: undefined,
            }));
          }
          // Handle old media_urls format
          else if (data.media_urls && data.media_urls.length > 0) {
            slides = data.media_urls.map((url: string, index: number) => ({
              imageUrl: url,
              caption: data.stories_text?.[index] || data.content || "",
              imagePrompt: "",
              videoUrl: undefined,
            }));
          }
          // Handle old single-image format
          else if (data.media_url || data.imageUrl) {
            slides = [
              {
                imageUrl: data.media_url || data.imageUrl,
                caption: data.content || "",
                imagePrompt: "",
              },
            ];
          }

          return {
            ...data,
            id: e.id,
            timestamp: new Date(e.created_at || data.timestamp),
            slides: slides.length > 0 ? slides : data.slides || [],
            imageUrl:
              slides.length > 0
                ? slides[0].imageUrl
                : data.media_url || data.imageUrl || "",
            content:
              data.content || (slides.length > 0 ? slides[0].caption : ""),
            status: data.status,
            prompt: data.prompt,
            error: data.error,
          };
        });
        setPosts((prev) => ({ ...prev, [inf.id]: fetchedPosts }));
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  // Subscribe to SSE updates for all influencer posts
  useEffect(() => {
    if (!isAuthenticated || influencers.length === 0) return;

    const sseManager = getSSEManager();
    const unsubscribeFns: (() => void)[] = [];

    // Subscribe to updates for each influencer
    influencers.forEach((influencer) => {
      const unsubscribe = sseManager.subscribe(
        `influencer:${influencer.id}`,
        (event, eventType) => {
          if (eventType === "post_update") {
            const { post_id, status, image_urls, image_slides, error } =
              event.data;

            console.log("[InfluencerContext] SSE post_update received:", {
              post_id,
              status,
              influencer_id: influencer.id,
              has_image_urls: !!image_urls,
              has_image_slides: !!image_slides,
              event_data: event.data,
            });

            // Show toast notifications for status changes
            if (status === "ready") {
              showToast("✨ Post ready!", "success");
            } else if (status === "video_ready") {
              showToast("🎥 Video ready!", "success");
            } else if (status === "failed" || status === "video_failed") {
              showToast("❌ Generation failed", "error");
            } else if (status === "generating_story") {
              showToast("📝 Writing story...", "info");
            } else if (status === "generating_images") {
              showToast("🎨 Generating images...", "info");
            } else if (status === "generating_video") {
              showToast("🎬 Generating video...", "info");
            }

            // Update the post in state
            setPosts((prev) => {
              const influencerPosts = prev[influencer.id] || [];
              const existingPost = influencerPosts.find(
                (p) => p.id === post_id,
              );

              console.log("[InfluencerContext] Looking for post:", {
                post_id,
                existingPost: !!existingPost,
                influencerPostsCount: influencerPosts.length,
                allPostIds: influencerPosts.map((p) => p.id),
              });

              // If post doesn't exist and this is a pending/early status, create placeholder
              if (
                !existingPost &&
                (status === "pending" || status === "generating_story")
              ) {
                const placeholderPost: Post = {
                  id: post_id,
                  influencerId: influencer.id,
                  content: "",
                  imageUrl: "",
                  platform: "Instagram",
                  likes: 0,
                  comments: 0,
                  timestamp: new Date(),
                  hashtags: [],
                  slides: [],
                  status,
                  prompt: event.data.prompt || "",
                  error: error,
                };
                console.log(
                  "[InfluencerContext] Creating placeholder post via SSE:",
                  post_id,
                );
                return {
                  ...prev,
                  [influencer.id]: [placeholderPost, ...influencerPosts],
                };
              }

              // Update existing post
              const updatedPosts = influencerPosts.map((post) => {
                if (post.id === post_id) {
                  console.log(
                    "[InfluencerContext] Updating post:",
                    post_id,
                    "from",
                    post.status,
                    "to",
                    status,
                  );

                  // Build updated slides array
                  let updatedSlides = post.slides || [];
                  if (image_slides && image_slides.length > 0) {
                    // Use image_slides from backend if available
                    updatedSlides = image_slides.map((slide: any) => ({
                      imageUrl: slide.imageUrl,
                      caption: slide.caption || "",
                      imagePrompt: "",
                    }));
                  } else if (image_urls && image_urls.length > 0) {
                    // Fallback: reconstruct from image_urls, preserving existing captions
                    updatedSlides = image_urls.map(
                      (url: string, i: number) => ({
                        imageUrl: url,
                        caption: post.slides?.[i]?.caption || "",
                        imagePrompt: "",
                      }),
                    );
                  }

                  return {
                    ...post,
                    status,
                    ...(updatedSlides.length > 0 && {
                      imageUrl: updatedSlides[0].imageUrl,
                      slides: updatedSlides,
                    }),
                    ...(error && { error }),
                  };
                }
                return post;
              });
              console.log(
                "[InfluencerContext] Posts array updated for influencer:",
                influencer.id,
              );
              return { ...prev, [influencer.id]: updatedPosts };
            });
          }
        },
      );
      unsubscribeFns.push(unsubscribe);
    });

    // Cleanup subscriptions
    return () => {
      unsubscribeFns.forEach((fn) => fn());
    };
  }, [isAuthenticated, influencers, showToast]);

  const refreshData = async () => {
    await fetchData();
  };

  const addInfluencer = async (
    influencerData: Omit<Influencer, "id">,
  ): Promise<string> => {
    try {
      const res = await api.createInfluencer(influencerData as any);
      const newInfluencer: Influencer = { 
        ...res.data, 
        id: res.id,
        niche: res.data.niches?.[0] || res.data.niche || ""
      };
      setInfluencers((prev) => [newInfluencer, ...prev]);
      setPosts((prev) => ({ ...prev, [newInfluencer.id]: [] }));
      return newInfluencer.id;
    } catch (err) {
      console.error("Failed to add influencer", err);
      throw err;
    }
  };

  const updateInfluencer = async (updated: Influencer) => {
    try {
      const { id, ...data } = updated;
      await api.updateInfluencer(id, { data });
      setInfluencers((prev) =>
        prev.map((inf) => (inf.id === updated.id ? updated : inf)),
      );
    } catch (err) {
      console.error("Failed to update influencer", err);
    }
  };

  const addPost = async (influencerId: string, postData: Omit<Post, "id">) => {
    // Current backend add_posting Expects Kind: posting
    try {
      const res = await api.post("/postings/", {
        ...postData,
        influencer_id: influencerId,
      });
      const newPost = {
        ...res.data.data,
        id: res.data.id,
        timestamp: new Date(),
      };

      setPosts((prev) => {
        const currentPosts = prev[influencerId] || [];
        const exists = currentPosts.some((p) => p.id === newPost.id);
        if (exists) {
          return {
            ...prev,
            [influencerId]: currentPosts.map((p) =>
              p.id === newPost.id ? newPost : p,
            ),
          };
        }
        return {
          ...prev,
          [influencerId]: [newPost, ...currentPosts],
        };
      });
    } catch (err) {
      console.error("Failed to add post", err);
    }
  };

  const generatePost = async (influencerId: string, prompt: string) => {
    try {
      const res = await api.generatePosting(influencerId, prompt);
      const postData = res.data.data;
      const newPost: Post = {
        id: res.data.id,
        influencerId: postData.influencer_id,
        content: postData.content || "",
        imageUrl: "",
        platform: postData.platform || "Instagram",
        likes: 0,
        comments: 0,
        timestamp: new Date(res.data.created_at),
        hashtags: [],
        slides: [],
        status: (postData.status || "pending") as PostCreationStatus,
        prompt: postData.prompt,
      };

      console.log(
        "[InfluencerContext] Adding new post:",
        newPost.id,
        newPost.status,
      );

      setPosts((prev) => {
        const currentPosts = prev[influencerId] || [];
        const exists = currentPosts.some((p) => p.id === newPost.id);
        if (exists) {
          return {
            ...prev,
            [influencerId]: currentPosts.map((p) =>
              p.id === newPost.id ? newPost : p,
            ),
          };
        }
        return {
          ...prev,
          [influencerId]: [newPost, ...currentPosts],
        };
      });
    } catch (err) {
      console.error("Failed to generate post", err);
      showToast("Failed to create post", "error");
      throw err;
    }
  };

  const injectPost = (influencerId: string, post: Post) => {
    setPosts((prev) => {
      const currentPosts = prev[influencerId] || [];
      const exists = currentPosts.some((p) => p.id === post.id);
      if (exists) {
        console.log(
          "[InfluencerContext] injectPost: Updating existing post",
          post.id,
        );
        return {
          ...prev,
          [influencerId]: currentPosts.map((p) =>
            p.id === post.id ? post : p,
          ),
        };
      }
      console.log(
        "[InfluencerContext] injectPost: Adding new post",
        post.id,
      );
      return {
        ...prev,
        [influencerId]: [post, ...currentPosts],
      };
    });
  };

  const travelInfluencer = async (
    id: string,
    destination: string,
    mode: string,
    createStory: boolean,
  ) => {
    // Update the influencer's location directly
    try {
      const influencer = getInfluencer(id);
      if (!influencer) throw new Error("Influencer not found");

      const updated = {
        ...influencer,
        location: destination,
      };
      await updateInfluencer(updated);

      if (createStory) {
        // Automatically generate a travel story
        await generatePost(
          id,
          `Creating a story about traveling to ${destination} by ${mode}.`,
        );
      }

      return { success: true, location: destination };
    } catch (err) {
      console.error("Failed to travel influencer", err);
      throw err;
    }
  };

  const getInfluencer = (id: string) => influencers.find((i) => i.id === id);
  const getPosts = (influencerId: string) => posts[influencerId] || [];

  return (
    <InfluencerContext.Provider
      value={{
        influencers,
        posts,
        addInfluencer,
        updateInfluencer,
        addPost,
        generatePost,
        injectPost,
        getInfluencer,
        getPosts,
        refreshData,
        travelInfluencer,
      }}
    >
      {children}
    </InfluencerContext.Provider>
  );
};

export const useInfluencers = () => {
  const context = useContext(InfluencerContext);
  if (context === undefined) {
    throw new Error("useInfluencers must be used within an InfluencerProvider");
  }
  return context;
};
