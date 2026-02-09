/**
 * Post Creation Service
 * Handles post creation and retrieval with type transformations
 */

import { httpClient } from './http-client';
import { ENDPOINTS } from './config';
import type { Post, PostingEntity, CreatePostRequest, PostStatus } from './api-types';

// Re-export types
export type { PostStatus as PostCreationStatus } from './api-types';

/**
 * Create a new post
 */
export const createPost = async (
  influencerId: string,
  prompt: string,
  referenceImageUrl?: string,
  referenceImages?: any[],
  platform: string = 'Instagram'
): Promise<Post> => {
  const response = await httpClient.post<{ data: PostingEntity }>(
    ENDPOINTS.POSTS_CREATE,
    {
      influencer_id: influencerId,
      prompt,
      reference_image_url: referenceImageUrl,
      reference_images: referenceImages,
      platform,
    } as CreatePostRequest
  );
  return transformPostingToPost(response.data);
};

/**
 * Get a post by ID
 */
export const getPost = async (postId: string): Promise<Post> => {
  const response = await httpClient.get<{ data: PostingEntity }>(
    ENDPOINTS.POST_BY_ID(postId),
    { skipCache: true } // Don't cache post state
  );
  return transformPostingToPost(response.data);
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<void> => {
  await httpClient.delete<void>(ENDPOINTS.POST_BY_ID(postId));
};

/**
 * Transform backend posting entity to frontend Post
 */
function transformPostingToPost(entity: PostingEntity): Post {
  const data = entity.data;

  // Build slides array from various formats
  let slides = [];
  if (data.image_slides && data.image_slides.length > 0) {
    slides = data.image_slides.map((slide: any) => ({
      imageUrl: slide.imageUrl || slide.image_url,
      caption: slide.caption || '',
      imagePrompt: slide.imagePrompt || '',
    }));
  } else if (data.image_urls && data.image_urls.length > 0) {
    slides = data.image_urls.map((url: string, i: number) => ({
      imageUrl: url,
      caption: data.generated_content?.slides?.[i]?.caption || '',
      imagePrompt: '',
    }));
  }

  return {
    id: entity.id,
    influencerId: data.influencer_id,
    content: data.content || '',
    imageUrl: slides.length > 0 ? slides[0].imageUrl : '',
    platform: data.platform || 'Instagram',
    likes: 0,
    comments: 0,
    timestamp: new Date(entity.created_at),
    hashtags: [],
    slides: slides,
    status: data.status,
    prompt: data.prompt,
    error: data.error,
  };
}