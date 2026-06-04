import crypto from 'crypto';
import { config } from '../config';

type TelegramUserData = {
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  chatId?: number | string;
};

export type WordPressMessageResult = {
  response: string;
  source: 'database' | 'gemini' | 'cache' | string;
};

export class WordPressApiClientError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
    this.name = 'WordPressApiClientError';
  }
}

class WordPressApiClient {
  async sendMessage(data: { telegramId: number | bigint; message: string; userData?: TelegramUserData }): Promise<WordPressMessageResult> {
    if (!config.wordpress.apiUrl) {
      throw new WordPressApiClientError('WORDPRESS_API_URL تنظیم نشده است', 500);
    }

    const body = JSON.stringify({
      telegram_id: Number(data.telegramId),
      message: data.message,
      user_data: data.userData || {},
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-propchi-timestamp': timestamp,
    };

    if (config.wordpress.botApiKey) {
      headers['x-propchi-bot-key'] = config.wordpress.botApiKey;
    }
    if (config.wordpress.signatureSecret) {
      headers['x-propchi-signature'] = crypto
        .createHmac('sha256', config.wordpress.signatureSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
    }

    const response = await fetch(config.wordpress.apiUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(config.wordpress.timeoutMs),
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new WordPressApiClientError(payload?.message || payload?.error || 'WordPress API error', response.status);
    }
    if (!payload?.response || typeof payload.response !== 'string') {
      throw new WordPressApiClientError('پاسخ وردپرس نامعتبر است', 502);
    }

    return { response: payload.response, source: payload.source || 'database' };
  }
}

export const wordpressApiClient = new WordPressApiClient();
