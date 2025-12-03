
export enum ContactType {
  OWNER = 'Proprietário',
  BUILDER = 'Construtor',
  CLIENT = 'Cliente/Comprador'
}

export enum AutomationStage {
  IDLE = 0,
  WAITING_REPLY_1 = 1,
  WAITING_REPLY_2 = 2,
  NO_RESPONSE_ALERT = 3
}

export interface ChatMessage {
  id: string;
  role: 'agent' | 'client';
  content: string;
  timestamp: number;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  type: ContactType;
  lastContactDate: string;
  notes: string;
  followUpFrequencyDays: number;
  
  // Automação e Sync
  autoPilotEnabled?: boolean;
  automationStage: AutomationStage;
  lastAutomatedMsgDate?: string;
  lastReplyContent?: string; // Mantido para compatibilidade visual rápida
  lastReplyTimestamp?: number;
  hasUnreadReply?: boolean;
  
  // Histórico de Conversa
  chatHistory?: ChatMessage[];
}

export interface AppSettings {
  agentName: string;
  agencyName: string; 
  apiKey?: string;
  messageTone: 'Formal' | 'Casual' | 'Persuasivo' | 'Amigável' | 'Consultivo' | 'Urgente' | 'Entusiasta' | 'Elegante';
  defaultFrequencyOwner: number;
  defaultFrequencyBuilder: number;
  defaultFrequencyClient: number;
  integrationMode: 'server';
  serverUrl?: string;
  preferredWhatsappMode: 'app';
  whatsappConnected: boolean;
  
  // Controle do Servidor
  serverAutomationEnabled?: boolean;
}