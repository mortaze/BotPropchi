import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { aiSettingsService } from './ai-settings.service';
import { logger } from '../utils/logger';

export interface PropFirmData {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  rules_summary: string;
  website: string;
  discount_code: string;
  discount_percent: string;
  valid_until: string;
  related_post_id: number | null;
}

class AiDataService {
  private cache: { data: PropFirmData[] | null; loadedAt: number } = { data: null, loadedAt: 0 };
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  async getSheetHeaders(): Promise<string[]> {
    const settings = await aiSettingsService.getSettings();
    if (!settings.googleServiceAccountEmail || !settings.googlePrivateKey || !settings.googleSheetId) {
      throw new Error('تنظیمات اتصال به Google Sheets کامل نیست');
    }

    const privateKey = settings.googlePrivateKey.replace(/\\n/g, '\n');
    const auth = new JWT({
      email: settings.googleServiceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const doc = new GoogleSpreadsheet(settings.googleSheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    return sheet.headerValues;
  }

  async loadPropFirmsFromSheet(): Promise<PropFirmData[]> {
    const settings = await aiSettingsService.getSettings();
    if (!settings.googleServiceAccountEmail || !settings.googlePrivateKey || !settings.googleSheetId) {
      throw new Error('تنظیمات اتصال به Google Sheets کامل نیست');
    }

    const mapping: Record<string, string> = (settings.googleSheetMapping as Record<string, string>) || {};

    const getKey = (field: string) => mapping[field] || field;

    const privateKey = settings.googlePrivateKey.replace(/\\n/g, '\n');
    const auth = new JWT({
      email: settings.googleServiceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const doc = new GoogleSpreadsheet(settings.googleSheetId, auth);
    await doc.loadInfo();
    const rows = await doc.sheetsByIndex[0].getRows();

    return rows
      .map((r: any) => r.toObject())
      .filter((r: any) => String(r[getKey('active')]).toUpperCase() !== 'FALSE')
      .map((r: any) => ({
        id: r[getKey('id')] || '',
        name: r[getKey('name')] || '',
        aliases: (r[getKey('aliases')] || '').split(',').map((a: string) => a.trim()).filter(Boolean),
        summary: r[getKey('summary')] || '',
        rules_summary: r[getKey('rules_summary')] || '',
        website: r[getKey('website')] || '',
        discount_code: r[getKey('discount_code')] || '',
        discount_percent: r[getKey('discount_percent')] || '',
        valid_until: r[getKey('valid_until')] || '',
        related_post_id: r[getKey('related_post_id')] ? parseInt(r[getKey('related_post_id')], 10) : null,
      }));
  }

  async getPropFirmsData(forceRefresh = false): Promise<PropFirmData[]> {
    if (forceRefresh || !this.cache.data || Date.now() - this.cache.loadedAt > this.CACHE_TTL_MS) {
      try {
        this.cache.data = await this.loadPropFirmsFromSheet();
        this.cache.loadedAt = Date.now();
        logger.info(`[AI Data] Loaded ${this.cache.data.length} prop firms from Google Sheets`);
      } catch (error) {
        logger.error('[AI Data] Failed to load data from Google Sheets:', error);
        if (!this.cache.data) {
          throw error;
        }
        // Fallback to old cache if available
        logger.warn('[AI Data] Falling back to cached data');
      }
    }
    return this.cache.data || [];
  }

  invalidateCache() {
    this.cache = { data: null, loadedAt: 0 };
  }
}

export const aiDataService = new AiDataService();
