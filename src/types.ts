export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

export interface PodcastData {
  id: string;
  title: string;
  script: string;
  audioBase64?: string;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  podcast?: PodcastData;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: number;
}
