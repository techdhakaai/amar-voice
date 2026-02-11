
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
  MARKET_INSIGHTS = 'MARKET_INSIGHTS',
  TESTING_LAB = 'TESTING_LAB',
  SETTINGS = 'SETTINGS',
  SUBSCRIPTION = 'SUBSCRIPTION',
  SETUP = 'SETUP'
}
