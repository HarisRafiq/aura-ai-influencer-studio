import React, { useState, useEffect } from "react";
import { X, Image as ImageIcon, Sparkles, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "../../services/ToastContext";
import { createPost } from "../../services/post_creation";
import { useInfluencers } from "../../services/InfluencerContext";
import { Influencer } from "../../types";

interface PostCreatorProps {
  influencer: Influencer;
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  initialPrompt?: string;
}

interface ReferenceImage {
  id: string;
  file: File;
  preview: string;
  role: "character" | "product" | "location" | "person" | "object";
  description: string;
}

const PostCreator: React.FC<PostCreatorProps> = ({
  influencer,
  isOpen,
  onClose,
  onPostCreated,
  initialPrompt = "",
}) => {
  const { showToast } = useToast();
  const { injectPost } = useInfluencers();
  const [prompt, setPrompt] = useState(initialPrompt);
  
  // Multi-image state
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen && initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages: ReferenceImage[] = [];
      Array.from(e.target.files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setReferenceImages((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substr(2, 9),
                file,
                preview: ev.target!.result as string,
                role: "product", // Default role
                description: "",
              },
            ]);
          }
        };
        reader.readAsDataURL(file);
      });
      // Clear input
      e.target.value = "";
    }
  };

  const updateReferenceImage = (id: string, updates: Partial<ReferenceImage>) => {
    setReferenceImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...updates } : img))
    );
  };

  const removeReferenceImage = (id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleCreate = async () => {
    if (!prompt.trim()) return;

    setIsCreating(true);
    try {
      // Prepare reference images for API
      // Transform to [{url: "data:...", role: "...", description: "..."}]
      const apiReferences = referenceImages.map(img => ({
        url: img.preview,
        role: img.role,
        description: img.description || img.role // Fallback description
      }));

      // Create post and get the returned post object
      // Pass the first image as the "main" reference for backward compatibility if needed, 
      // but ideally backend handles the list.
      // We'll pass the list as the 4th argument.
      const newPost = await createPost(
        influencer.id,
        prompt,
        undefined, // deprecated single ref url
        apiReferences,
        "Instagram"
      );

      console.log("[PostCreator] Created post from API:", {
        id: newPost.id,
        status: newPost.status,
        influencerId: newPost.influencerId,
        fullPost: newPost,
      });

      // Immediately inject the post into state for instant feed update
      injectPost(influencer.id, newPost);
      
      showToast(
        "Post creation started! Watch it generate in real-time.",
        "success",
      );
      onPostCreated();
      onClose();

      // Reset state
      setPrompt("");
      setReferenceImages([]);
    } catch (e: any) {
      showToast("Failed to create post", "error");
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] w-full max-w-3xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-indigo-400" size={20} />
            <h3 className="font-semibold text-white">Create New Post</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Prompt Section */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-300">
              What's the story?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Describe what ${influencer.name} is doing... (e.g. "Hiking in the Swiss Alps, enjoying the view")`}
              className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 resize-none transition-all"
              disabled={isCreating}
            />
          </div>

          {/* Reference Images Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-300">
                Additional References (Optional)
              </label>
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 rounded-lg cursor-pointer hover:bg-indigo-500/20 transition-colors">
                <Plus size={14} />
                Add Image
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={isCreating}
                />
              </label>
            </div>
            
            <p className="text-xs text-gray-500">
              Upload products, places, or other people to include in the post.
            </p>

            {/* Image List */}
            {referenceImages.length > 0 && (
              <div className="space-y-3">
                {referenceImages.map((img, index) => (
                  <div key={img.id} className="flex gap-4 p-3 bg-white/5 rounded-xl border border-white/10">
                    {/* Preview */}
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-black/50">
                      <img src={img.preview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    
                    {/* Controls */}
                    <div className="flex-1 space-y-2">
                       <div className="flex gap-2">
                          <select
                            value={img.role}
                            onChange={(e) => updateReferenceImage(img.id, { role: e.target.value as any })}
                            className="bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                            disabled={isCreating}
                          >
                            <option value="product">Product</option>
                            <option value="location">Location/Background</option>
                            <option value="person">Person</option>
                            <option value="object">Object</option>
                            <option value="character">Character Style</option>
                          </select>
                          <input 
                            type="text"
                            value={img.description}
                            onChange={(e) => updateReferenceImage(img.id, { description: e.target.value })}
                            placeholder="Describe this item (e.g. 'Red Nike Shoes', 'Eiffel Tower')"
                            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                            disabled={isCreating}
                          />
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                             Reference #{index + 2}
                          </span>
                          <button 
                            onClick={() => removeReferenceImage(img.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            disabled={isCreating}
                          >
                            <Trash2 size={14} />
                          </button>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {referenceImages.length === 0 && (
               <div className="flex flex-col items-center justify-center py-8 border border-dashed border-white/10 rounded-xl bg-white/5/50">
                  <span className="text-gray-600 text-sm">No additional references added</span>
               </div>
            )}

          </div>

          {isCreating && (
            <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Loader2 className="text-indigo-400 animate-spin" size={20} />
              <span className="text-sm font-medium text-white">
                Creating post... This will appear in your feed shortly.
              </span>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-6 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !prompt.trim()}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Create Post
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostCreator;
