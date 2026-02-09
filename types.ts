export enum PostCreationStatus {
  PENDING = "pending",
  GENERATING_STORY = "generating_story",
  GENERATING_IMAGES = "generating_images",
  GENERATING_VIDEO = "generating_video",
  VIDEO_READY = "video_ready",
  VIDEO_FAILED = "video_failed",
  READY = "ready",
  PUBLISHED = "published",
  FAILED = "failed"
}

export interface Influencer {
  id: string;
  name: string;
  handle: string;
  niche: string;
  bio: string;
  traits: string[];
  visualDescription: string;
  platformFocus: string;
  location: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  timezone: string;
  avatarUrl: string;
}

export interface Post {
  id: string;
  influencerId?: string;
  content: string;
  imageUrl: string;
  platform: string;
  likes: number;
  comments: number;
  timestamp: Date;
  hashtags: string[];
  location?: string;
  slides?: StorySlide[];
  videoUrls?: VideoSlide[];
  status?: PostCreationStatus;
  prompt?: string;
  error?: string;
}

export interface VideoSlide {
  slideIndex: number;
  videoUrl: string;
  imageUrl: string;
  caption: string;
}

export interface ScoutedPlace {
  title: string;
  uri: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  address?: string;
}

export interface POI {
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  placeId: string;
  types?: string[];
}

export interface LocationPOIsResponse {
  center: { lat: number; lng: number };
  pois: POI[];
  location: string;
}

export interface LocalEvent {
  title: string;
  location: string;
  date: string;
  description: string;
}

export interface NewsItem {
  title: string;
  source: string;
  summary: string;
  url?: string;
}

export interface StorySetupResponse {
  question: string;
  options: string[];
  context: string;
}

export interface StorySlide {
  imagePrompt: string;
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
}