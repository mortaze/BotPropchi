import { prisma } from '../prisma/client';
import fetch from 'node-fetch';

export interface AiSettingsData {
  openrouterApiKey: string | null;
  selectedModel: string | null;
  googleServiceAccountEmail: string | null;
  googlePrivateKey: string | null;
  googleSheetId: string | null;
  googleSheetMapping?: any;
}

class AiSettingsService {
  async getSettings(): Promise<AiSettingsData> {
    const settings = await prisma.aiSettings.findFirst();
    if (!settings) {
      return {
        openrouterApiKey: null,
        selectedModel: null,
        googleServiceAccountEmail: null,
        googlePrivateKey: null,
        googleSheetId: null,
        googleSheetMapping: null,
      };
    }
    return settings;
  }

  async updateSettings(data: Partial<AiSettingsData>): Promise<void> {
    const existing = await prisma.aiSettings.findFirst();
    if (existing) {
      await prisma.aiSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.aiSettings.create({
        data: {
          openrouterApiKey: data.openrouterApiKey ?? null,
          selectedModel: data.selectedModel ?? null,
          googleServiceAccountEmail: data.googleServiceAccountEmail ?? null,
          googlePrivateKey: data.googlePrivateKey ?? null,
          googleSheetId: data.googleSheetId ?? null,
        },
      });
    }
  }

  async getOpenRouterModels(apiKey: string) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models?supported_parameters=structured_outputs', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw new Error('نامعتبر بودن کلید OpenRouter یا خطای سرور');
      }
      const json = await res.json() as any;
      if (!json || !json.data) return [];
      
      return json.data.map((m: any) => ({
        id: m.id,
        name: m.name,
        pricing: m.pricing,
        context_length: m.context_length,
      }));
    } catch (error) {
      console.error('[AI Settings] Error fetching OpenRouter models:', error);
      throw new Error('خطا در دریافت لیست مدل‌ها');
    }
  }
}

export const aiSettingsService = new AiSettingsService();
