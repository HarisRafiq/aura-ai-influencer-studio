/**
 * API Service
 * Main API client for all backend endpoints
 * Uses production-ready HTTP client with retry, caching, and error handling
 */

import { httpClient } from './http-client';
import { ENDPOINTS } from './config';
import type {
  Influencer,
  CreateInfluencerRequest,
  UpdateInfluencerRequest,
  PostingEntity,
  CreatePostRequest,
} from './api-types';

/**
 * Legacy API interface for backward compatibility
 * @deprecated Use specific service methods instead
 */
export const api = {
  async get(endpoint: string) {
    return httpClient.get(endpoint);
  },

  async post(endpoint: string, data?: any) {
    return httpClient.post(endpoint, data);
  },

  async put(endpoint: string, data?: any) {
    return httpClient.put(endpoint, data);
  },

  async delete(endpoint: string) {
    return httpClient.delete(endpoint);
  },

  // Streamlined Endpoints
  async fetchInfluencers(): Promise<Influencer[]> {
    return httpClient.get<Influencer[]>(ENDPOINTS.INFLUENCERS);
  },

  async createInfluencer(data: CreateInfluencerRequest): Promise<Influencer> {
    return httpClient.post<Influencer>(ENDPOINTS.INFLUENCERS, data);
  },

  async updateInfluencer(id: string, data: UpdateInfluencerRequest): Promise<Influencer> {
    return httpClient.put<Influencer>(ENDPOINTS.INFLUENCER_BY_ID(id), data);
  },

  async fetchPostings(influencerId: string): Promise<PostingEntity[]> {
    return httpClient.get<PostingEntity[]>(ENDPOINTS.POSTS_BY_INFLUENCER(influencerId));
  },

  async generatePosting(
    influencerId: string,
    prompt: string,
    platform: string = 'Instagram',
    referenceImageUrl?: string,
    referenceImages?: any[]
  ): Promise<{ data: PostingEntity }> {
    return httpClient.post<{ data: PostingEntity }>(ENDPOINTS.POSTS_CREATE, {
      influencer_id: influencerId,
      prompt,
      platform,
      reference_image_url: referenceImageUrl,
      reference_images: referenceImages,
    });
  },

  async fetchSuggestions(influencerId: string) {
    return httpClient.get(`/suggestions/influencer/${influencerId}`);
  },
};

/**
 * Type-safe API methods (recommended)
 */
export const influencerApi = {
  /**
   * Get all influencers for the current user
   */
  async list(): Promise<Influencer[]> {
    return httpClient.get<Influencer[]>(ENDPOINTS.INFLUENCERS);
  },

  /**
   * Get a specific influencer by ID
   */
  async get(id: string): Promise<Influencer> {
    return httpClient.get<Influencer>(ENDPOINTS.INFLUENCER_BY_ID(id));
  },

  /**
   * Create a new influencer
   */
  async create(data: CreateInfluencerRequest): Promise<Influencer> {
    return httpClient.post<Influencer>(ENDPOINTS.INFLUENCERS, data);
  },

  /**
   * Update an existing influencer
   */
  async update(id: string, data: UpdateInfluencerRequest): Promise<Influencer> {
    httpClient.clearCacheEntry(ENDPOINTS.INFLUENCERS);
    httpClient.clearCacheEntry(ENDPOINTS.INFLUENCER_BY_ID(id));
    return httpClient.put<Influencer>(ENDPOINTS.INFLUENCER_BY_ID(id), data);
  },

  /**
   * Delete an influencer
   */
  async delete(id: string): Promise<void> {
    httpClient.clearCacheEntry(ENDPOINTS.INFLUENCERS);
    httpClient.clearCacheEntry(ENDPOINTS.INFLUENCER_BY_ID(id));
    return httpClient.delete<void>(ENDPOINTS.INFLUENCER_BY_ID(id));
  },
};

export const postingApi = {
  /**
   * Get all posts for an influencer
   */
  async listByInfluencer(influencerId: string): Promise<PostingEntity[]> {
    return httpClient.get<PostingEntity[]>(ENDPOINTS.POSTS_BY_INFLUENCER(influencerId));
  },

  /**
   * Get a specific post by ID
   */
  async get(postId: string): Promise<PostingEntity> {
    return httpClient.get<PostingEntity>(ENDPOINTS.POST_BY_ID(postId));
  },

  /**
   * Create a new post
   */
  async create(data: CreatePostRequest): Promise<{ data: PostingEntity }> {
    httpClient.clearCacheEntry(ENDPOINTS.POSTS_BY_INFLUENCER(data.influencer_id));
    return httpClient.post<{ data: PostingEntity }>(ENDPOINTS.POSTS_CREATE, data);
  },

  /**
   * Delete a post
   */
  async delete(postId: string): Promise<void> {
    return httpClient.delete<void>(ENDPOINTS.POST_BY_ID(postId));
  },
};
