import { validID } from './model.mjs';
// Webhook authors are not Discord user accounts. These rules only hide local chat rows.
export function normalizeID(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return validID(text) ? text : (text.match(/^<@!?(\d{17,20})>$/)?.[1] ?? '');
}

export const appEntryKey = entry => `app:${entry.id}:${entry.name}`;

export function appEntries(storage, account) {
  const entries = storage?.appBlocksByAccount?.[account];
  return Array.isArray(entries) ? entries.filter(entry => validID(entry?.id)
    && typeof entry.name === 'string' && entry.name.length <= 128) : [];
}

export function shouldHideAppMessage(message, entries) {
  if (!message || !entries.length) return false;
  // Match only the message's own identity, never mentions, replies or command users.
  const ids = [message.author?.id, message.authorId, message.author_id,
    message.webhookId, message.webhook_id, message.applicationId, message.application_id,
    message.application?.id].filter(validID);
  const name = message.author?.username ?? message.username;
  return entries.some(entry => ids.includes(entry.id) && (!entry.name || name === entry.name));
}
