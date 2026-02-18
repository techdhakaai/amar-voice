

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export interface AnalyticsData {
  name: string;
  value: number;
}

export interface OrderStatus {
  id: string;
  status: 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';
  eta: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  location: string;
  interest: string;
  timestamp: Date;
}

export interface MarketPrice {
  product: string;
  source: string;
  price: string;
  link: string;
}

export interface SentimentPoint {
  day: string;
  positive: number;
  negative: number;
}

export interface BusinessConfig {
  shopName: string;
  deliveryInsideDhaka: number;
  deliveryOutsideDhaka: number;
  paymentMethods: string[];
  returnPolicy: string;
  bkashNumber: string;
  personaTone: 'formal' | 'friendly' | 'enthusiastic';
  subscriptionStatus: 'active' | 'trial' | 'expired';
  monthlyLimit: number;
  usageCount: number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  VOICE_AGENT = 'VOICE_AGENT',
  LEADS = 'LEADS',
  MARKET_INSIGHTS = 'MARKET_INSIGHTS',
  PRICE_TRACKER = 'PRICE_TRACKER',
  SETUP = 'SETUP',
  SETTINGS = 'SETTINGS'
}

export interface ImageInteraction {
  id: string; // Unique ID for the interaction
  timestamp: Date;
  userImage?: { data: string; mimeType: string };
  aiTextResponse?: string; // AI's textual analysis/response
  aiImageResponse?: { data: string; mimeType: string }; // AI's generated/edited image
}