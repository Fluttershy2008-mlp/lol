// Stealmoji Revenge adaptation, GPL-3.0. See LICENSE and NOTICE.
export function createCore(env = globalThis) {
  const LIMIT = 256 * 1024;
  const idPattern = /^\d{17,20}$/;
  function name(value) {
    const clean = String(value || 'emoji').replace(/^:+|:+$/g, '').split('~')[0].replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
    return clean.length >= 2 ? clean : 'emoji_' + clean;
  }
  const validName = value => /^[A-Za-z0-9_]{2,32}$/.test(value);
  function parse(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const text = value.trim();
      const mention = /^<(a?):([A-Za-z0-9_]+):(\d{17,20})>$/.exec(text);
      if (mention) return { id: mention[3], name: name(mention[2]), animated: mention[1] === 'a' };
      const url = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/(\d{17,20})\.(png|gif|webp|jpe?g|avif)(?:[?#].*)?$/i.exec(text);
      if (url) return { id: url[1], name: 'emoji', animated: url[2].toLowerCase() === 'gif' || /[?&]animated=true(?:&|$)/i.test(text) };
      return idPattern.test(text) ? { id: text, name: 'emoji', animated: false } : null;
    }
    if (typeof value !== 'object') return null;
    const fromURL = typeof value.src === 'string' ? parse(value.src) : null;
    const id = String(value.id ?? fromURL?.id ?? '');
    if (!idPattern.test(id)) return null;
    return { id, name: name(value.name ?? value.alt), animated: Boolean(value.animated || fromURL?.animated) };
  }
  const url = (emoji, size = 128) => `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
  function errorMessage(error) {
    const status = error?.status ?? error?.statusCode ?? error?.response?.status;
    const code = error?.body?.code;
    if (status === 429) return 'Discord is rate limiting emoji uploads. Wait before trying again.';
    if (status === 403 || code === 50013) return 'You no longer have permission to add emoji to this server.';
    if (code === 30008) return 'This server has no free slots for this emoji type.';
    if (status === 413) return 'The emoji is too large to upload.';
    return String(error?.body?.message ?? error?.message ?? 'The action failed. Please try again.').slice(0, 260);
  }
  function slots(guild, animated, emojiStore, slotModule) {
    try {
      const max = guild.getMaxEmojiSlots?.() ?? slotModule?.getMaxEmojiSlots?.(guild);
      const entry = emojiStore?.getGuilds?.()?.[guild.id];
      const raw = entry?.emojis ?? emojiStore?.getGuildEmoji?.(guild.id);
      if (!raw || !Number.isFinite(max) || max <= 0) return { full: false, used: null, max: null };
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      const used = list.filter(e => e && !e.managed && Boolean(e.animated) === animated).length;
      return { used, max, full: used >= max };
    } catch { return { full: false, used: null, max: null }; }
  }
  function canCreate(guild, user, permissions, constants) {
    if (!guild?.id) return false;
    if (user?.id && (guild.ownerId === user.id || guild.owner_id === user.id)) return true;
    const P = constants?.Permissions ?? {};
    // Old builds used Manage Emojis; only use that alias if Create Expressions is absent.
    const create = P.CREATE_GUILD_EXPRESSIONS ?? P.MANAGE_GUILD_EXPRESSIONS ?? P.MANAGE_EMOJIS_AND_STICKERS;
    for (const permission of [create, P.ADMINISTRATOR]) {
      if (permission == null) continue;
      try { if (permissions?.can?.(permission, guild)) return true; } catch {}
    }
    return false;
  }
  async function imageData(emoji, isCurrent = () => true) {
    let oversized = false;
    for (const size of [128, 64, 32]) {
      if (!isCurrent()) throw new Error('Stealmoji was disabled.');
      const controller = env.AbortController ? new env.AbortController() : null;
      let reader, timer, expired = false;
      try {
        const operation = (async () => {
          const response = await env.fetch(url(emoji, size), controller ? { signal: controller.signal } : undefined);
          if (!response.ok) throw Object.assign(new Error(`Could not download emoji (HTTP ${response.status}).`), { status: response.status });
          const length = Number(response.headers?.get?.('content-length'));
          if (length > LIMIT) return null;
          const blob = await response.blob();
          if (expired || !isCurrent()) throw new Error('Download cancelled.');
          if (blob.size > LIMIT) return null;
          if (!blob.size) throw new Error('Discord returned an empty image.');
          if (blob.type && blob.type !== 'application/octet-stream' && !/^image\/(png|gif|webp|jpe?g|avif)(?:;|$)/i.test(blob.type)) throw new Error('Discord did not return an emoji image.');
          const data = await new Promise((resolve, reject) => {
            reader = new env.FileReader();
            const done = () => typeof reader.result === 'string' && reader.result.startsWith('data:')
              ? resolve(reader.result) : reject(new Error('Could not read emoji image.'));
            reader.onload = done;
            reader.onloadend = done;
            reader.onerror = () => reject(new Error('Could not read emoji image.'));
            reader.onabort = () => reject(new Error('Image download cancelled.'));
            reader.readAsDataURL(blob);
          });
          // Some RN builds label Blob data as application/octet-stream.
          const match = /^data:[^,]*;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(data);
          if (!match) throw new Error('Could not encode the emoji image.');
          const payload = match[1].replace(/[\r\n]/g, '');
          const bytes = payload.length * 3 / 4 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
          if (bytes > LIMIT) return null;
          const mime = payload.startsWith('R0lGOD') ? 'image/gif' : payload.startsWith('iVBORw0KGgo') ? 'image/png'
            : payload.startsWith('/9j/') ? 'image/jpeg' : payload.startsWith('UklGR') ? 'image/webp' : null;
          if (!mime) throw new Error('Discord did not return a supported emoji image.');
          // Animated downloads must never silently become still images.
          if (emoji.animated && mime !== 'image/gif') throw new Error('Discord returned a still image for this animated emoji.');
          return `data:${mime};base64,${payload}`;
        })();
        const timeout = new Promise((_, reject) => {
          timer = env.setTimeout(() => {
            expired = true;
            try { controller?.abort(); reader?.abort(); } catch {}
            reject(new Error('Emoji download timed out. Please try again.'));
          }, 15000);
        });
        const data = await Promise.race([operation, timeout]);
        if (data) return data;
        oversized = true;
      } finally { env.clearTimeout(timer); }
    }
    throw new Error(oversized ? 'This emoji is still larger than 256 KiB at the smallest size.' : 'Could not download emoji.');
  }
  return { LIMIT, name, validName, parse, url, errorMessage, slots, canCreate, imageData };
}
