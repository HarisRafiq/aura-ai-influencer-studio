/**
 * API Types
 * Comprehensive TypeScript types for all API requests and responses
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  created_at: string;
}

// ============================================================================
// Influencer Types
// ============================================================================

export interface Influencer {
  id: string;
  kind: string;
  data: InfluencerData;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface InfluencerData {
  name: string;
  handle: string;
  bio: string;
  niches: string[];
  niche?: string;
  traits: string[];
  tone: string;
  visualDescription: string;
  platformFocus: string;
  location: string;
  timezone: string;
  avatarUrl: string;
}

export interface CreateInfluencerRequest {
  name: string;
  handle: string;
  bio: string;
  niches: string[];
  traits: string[];
  tone: string;
  visualDescription: string;
  platformFocus: string;
  location: string;
  timezone: string;
  avatarUrl: string;
}

export interface UpdateInfluencerRequest {
  data: Partial<InfluencerData>;
}

// ============================================================================
// Post/Posting Types
// ============================================================================

export type PostStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface Post {
  id: string;
  influencerId: string;
  content: string;
  imageUrl: string;
  platform: string;
  likes: number;
  comments: number;
  timestamp: Date;
  hashtags: string[];
  slides: PostSlide[];
  status?: PostStatus;
  prompt?: string;
  error?: string;
}

export interface PostSlide {
  imageUrl: string;
  caption: string;
  imagePrompt?: string;
}

export interface CreatePostRequest {
  influencer_id: string;
  prompt: string;
  platform?: string;
  reference_image_url?: string;
  reference_images?: ReferenceImage[];
}

export interface ReferenceImage {
  url: string;
  description?: string;
}

export interface PostingEntity {
  id: string;
  kind: string;
  data: PostingData;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface PostingData {
  influencer_id: string;
  platform: string;
  prompt: string;
  content?: string;
  image_urls?: string[];
  image_slides?: PostSlide[];
  generated_content?: any;
  status: PostStatus;
  error?: string;
}

// ============================================================================
// Creation Session Types
// ============================================================================

export type CreationStatus =
  | 'pending'
  | 'generating_images'
  | 'images_ready'
  | 'generating_persona'
  | 'persona_ready'
  | 'complete'
  | 'failed';

export interface CreationSession {
  id: string;
  owner_id: string;
  status: CreationStatus;
  location: string;
  prompt: string;
  avatar_urls: string[];
  selected_avatar_url?: string;
  generated_persona?: GeneratedPersona;
  influencer_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPersona {
  name: string;
  handle: string;
  bio: string;
  niches: string[];
  traits: string[];
  tone: string;
  platformFocus: string;
  visualDescription: string;
  timezone: string;
}

export interface StartCreationRequest {
  location: string;
  prompt: string;
}

export interface SelectAvatarRequest {
  avatar_url: string;
}

export interface ConfirmCreationRequest {
  name?: string;
  handle?: string;
  bio?: string;
  niches?: string[];
}

export interface ConfirmCreationResponse {
  message: string;
  influencer: Influencer;
}

// ============================================================================
// Orchestrator Types
// ============================================================================

export type OrchestratorPhase =
  | 'planning'
  | 'plan_review'
  | 'research'
  | 'selection'
  | 'generation'
  | 'complete'
  | 'error';

export type SubTaskStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface SubTask {
  id: string;
  name: string;
  queries: string[];
  status: SubTaskStatus;
  error?: string;
}

export interface WebItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
}

export interface ImageItem {
  id: string;
  thumbnail: string;
  image_url: string;
  title: string;
}

export interface SubTaskResults {
  web_items: WebItem[];
  images: ImageItem[];
}

export interface UserSelections {
  web_item_ids: string[];
  image_ids: string[];
}

export interface GeneratedPost {
  slide_count: number;
  grid_layout: string;
  slide_urls: string[];
  caption: string;
  posting_id?: string;
}

export interface OrchestratorSession {
  session_id: string;
  influencer_id: string;
  query: string;
  post_type_hint?: string;
  phase: OrchestratorPhase;
  research_plan: SubTask[];
  research_results: Record<string, SubTaskResults>;
  user_selections?: UserSelections;
  image_usage_plan?: Array<Record<string, any>>;
  generated_post?: GeneratedPost;
  error?: string;
}

export interface StartOrchestratorRequest {
  influencer_id: string;
  query: string;
  post_type_hint?: string;
  session_id?: string;
}

export interface StartOrchestratorResponse {
  session_id: string;
  message: string;
}

export interface EditPlanRequest {
  research_plan: Array<{
    id: string;
    name: string;
    queries: string[];
  }>;
}

export interface SelectionsRequest {
  web_item_ids: string[];
  image_ids: string[];
}

export interface RetrySubTaskRequest {
  custom_query?: string;
}

export interface RetrySubTaskResponse {
  message: string;
  web_count: number;
  image_count: number;
}

// ============================================================================
// Location Types
// ============================================================================

export interface LocationSuggestion {
  display_name: string;
  city: string;
  country: string;
  state?: string;
  lat: number;
  lng: number;
}

export interface GeocodedLocation {
  city: string;
  country: string;
  display_name: string;
  lat: number;
  lng: number;
  timezone: string;
  state?: string;
}

export interface LocationAutocompleteRequest {
  query: string;
  limit?: number;
}

export interface LocationGeocodeRequest {
  location: string;
}

export interface TravelRequest {
  destination: string;
  mode?: string;
  create_story?: boolean;
}

// ============================================================================
// SSE Event Types
// ============================================================================

export type SSEEventType =
  | 'status_update'
  | 'post_update'
  | 'video_status'
  | 'connected'
  | 'message'
  | 'agent_status'
  | 'agent_thinking'
  | 'agent_message'
  | 'agent_stream'
  | 'agent_error'
  | 'agent_action'
  | 'agent_question'
  | 'agent_complete'
  | 'orch_planning'
  | 'orch_plan_ready'
  | 'orch_researching'
  | 'orch_research_ready'
  | 'orch_generating'
  | 'orch_post_ready'
  | 'orch_question'
  | 'orch_error';

export interface SSEEvent {
  resource_id: string;
  data: any;
}

export interface OrchestratorEvent {
  message: string;
  [key: string]: any;
}
