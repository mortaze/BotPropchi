import { EventEmitter } from 'events';
import { logger } from './logger';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export const Events = {
  POST_CREATED: 'post:created',
  POST_PUBLISHED: 'post:published',
  POST_DELETED: 'post:deleted',
  POST_HIDDEN: 'post:hidden',
  POST_UNPUBLISHED: 'post:unpublished',
  POST_UPDATED: 'post:updated',
  MENU_LAYOUT_CHANGED: 'menu:layout:changed',
  COMMAND_ADDED: 'command:added',
  COMMAND_REMOVED: 'command:removed',
  COMMAND_UPDATED: 'command:updated',
} as const;

export type EventPayloads = {
  'post:created': { postId: number; title: string };
  'post:published': { postId: number; title: string };
  'post:deleted': { postId: number; title: string };
  'post:hidden': { postId: number; title: string };
  'post:unpublished': { postId: number; title: string };
  'post:updated': { postId: number; changes: string[] };
  'menu:layout:changed': { version: number };
  'command:added': { postId: number; command: string };
  'command:removed': { postId: number; command: string };
  'command:updated': { commandId: number; command: string };
};

export function logListenerCount(): void {
  for (const ev of Object.values(Events)) {
    const count = eventBus.listenerCount(ev);
    if (count > 0) {
      logger.debug(`[EventBus] "${ev}" has ${count} listener(s)`);
    }
  }
}
