import { Telegraf } from 'telegraf';
import { registerNewsAdminHandlers } from './news-admin.handlers';
import { registerNewsUserHandlers } from './news-user.handlers';

export function registerNewsHandlers(bot: Telegraf) {
  registerNewsAdminHandlers(bot);
  registerNewsUserHandlers(bot);
}
