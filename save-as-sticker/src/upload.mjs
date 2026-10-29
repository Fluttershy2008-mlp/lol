import { createExpressionUpload, expressionResponse } from '../../compatibility/expression-upload.mjs';

export function stickerValidationError(error) {
  let body = error?.body ?? error;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return; } }
  if (!body?.errors || typeof body.errors !== 'object') return;
  const messages = [], seen = new Set(); let visited = 0;
  const labels = { name: 'Sticker name',file: 'Sticker file',tags: 'Sticker emoji',description: 'Description' };
  function walk(value, path, depth) {
    if (!value || typeof value !== 'object' || depth > 8 || ++visited > 80 || messages.length >= 6 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value._errors)) for (const item of value._errors) {
      if (typeof item?.message !== 'string' || messages.length >= 6) continue;
      const field = (labels[path[0]] ?? path[0] ?? 'Sticker') + (path.length > 1 ? '.' + path.slice(1).join('.') : '');
      messages.push(field.replace(/[\u0000-\u001f]/g,'').slice(0,80) + ': ' + item.message.replace(/[\u0000-\u001f]/g,' ').slice(0,180));
    }
    for (const key of Object.keys(value)) {
      if (messages.length >= 6 || visited >= 80) break;
      if (key !== '_errors') walk(value[key],[...path,key],depth + 1);
    }
  }
  walk(body.errors,[],0);
  return messages.length ? 'Discord rejected the sticker:\n' + messages.join('\n') : undefined;
}

// Valenced uses the signed-in HTTP client rather than an undocumented action
// with a version-dependent call shape or fire-and-forget return value.
export function createStickerUpload(V, env = globalThis) {
  const legacy = createExpressionUpload(V, env);
  const safe = fn => { try { return fn(); } catch {} };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  const cancelled = () => Object.assign(new Error('Cancelled'), { code: 'E_PICKER_CANCELLED' });
  function pause(duration, check, signal) {
    return new Promise((resolve, reject) => {
      let timer, finished = false;
      const finish = error => {
        if (finished) return;
        finished = true; env.clearTimeout(timer); signal?.removeEventListener?.('abort', abort);
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(cancelled());
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener?.('abort', abort);
      timer = env.setTimeout(() => { try { check(); finish(); } catch (error) { finish(error); } }, duration);
    });
  }
  function resolve(kind) {
    if (kind !== 'sticker' || V.host?.id !== 'valenced') return legacy.resolve(kind);
    const rest = safe(() => V.metro.common.RestAPI) ?? safe(() => V.metro.common.restAPI)
      ?? byProps('HTTP')?.HTTP ?? byProps('get', 'post', 'del');
    if (typeof rest?.post !== 'function') throw new Error('Discord’s signed-in sticker upload API is unavailable. Restart Discord and try again.');
    return async (input, check = () => {}, signal) => {
      check();
      if (signal?.aborted) throw cancelled();
      if (!/^(file|content):\/\//.test(input.uri)) throw new Error('The sticker file is not ready to upload.');
      const fields = [{ name: 'name',value: input.name },{ name: 'tags',value: input.tags },
        { name: 'description',value: input.description ?? '' }];
      const attachments = [{ name: 'file',file: { uri: input.uri,
        name: input.mimeType === 'image/gif' ? 'sticker.gif' : 'sticker.png',type: input.mimeType } }];
      const url = `/guilds/${input.guildId}/stickers`;
      const account = safe(() => V.metro.findByStoreName('UserStore')?.getCurrentUser?.()?.id);
      const checkCurrent = () => {
        check();
        if (signal?.aborted || (account && safe(() => V.metro.findByStoreName('UserStore')?.getCurrentUser?.()?.id) !== account)) throw cancelled();
      };
      const statusOf = response => Number(response?.status ?? response?.statusCode ?? response?.response?.status);
      async function list() {
        if (typeof rest.get !== 'function') return;
        checkCurrent();
        const response = await rest.get({ url, failImmediatelyWhenRateLimited: true });
        checkCurrent();
        if (response?.ok === false || statusOf(response) >= 400) return;
        const parsed = await expressionResponse(response); checkCurrent();
        return Array.isArray(parsed) ? parsed : undefined;
      }
      let before;
      try { before = await list(); } catch { checkCurrent(); }
      const baseline = before ? new Set(before.map(sticker => sticker.id)) : undefined;
      checkCurrent();
      // Exactly one creation request. Verification can only make read requests.
      // Mobile HTTPUtils builds multipart with .field() and .attach(). Its
      // body/.send() path serializes RN FormData as JSON, dropping these fields.
      const response = await rest.post({ url, fields, attachments, oldFormErrors: true, failImmediatelyWhenRateLimited: true });
      checkCurrent();
      let created = await expressionResponse(response); checkCurrent();
      const status = statusOf(response);
      if (response?.ok === false || status >= 400 || (typeof created?.code === 'number' && typeof created?.message === 'string'))
        throw { status, body: created ?? response?.body };
      const matches = sticker => sticker && !Array.isArray(sticker) && typeof sticker.id === 'string' && sticker.id
        && (sticker.name == null || sticker.name === input.name)
        && (sticker.guild_id == null || sticker.guild_id === input.guildId)
        && (!account || !sticker.user?.id || sticker.user.id === account)
        && (!account || !sticker.user_id || sticker.user_id === account)
        && (sticker.format_type == null || (input.mimeType === 'image/gif' ? sticker.format_type === 4 : [1,2].includes(sticker.format_type)));
      if (!matches(created)) {
        created = undefined;
        if (baseline) {
          const delays = [350,750,1500];
          // Allow a short propagation delay for an empty success response.
          // Never accept an existing same-name sticker or an ambiguous match.
          for (let attempt = 0; attempt <= delays.length; attempt++) {
            let after;
            try { after = await list(); } catch { checkCurrent(); }
            if (!after) break;
            const fresh = after.filter(sticker => !baseline.has(sticker.id) && sticker.name === input.name && matches(sticker));
            if (fresh.length === 1) { created = fresh[0]; break; }
            if (fresh.length > 1 || attempt === delays.length || (!Number.isNaN(status) && status !== 201 && status !== 202)) break;
            await pause(delays[attempt], checkCurrent, signal);
          }
        }
      }
      checkCurrent();
      if (!created?.id) throw Object.assign(new Error('Discord did not confirm the upload. The server’s sticker list was checked; no upload was repeated.'),
        { code: 'STICKER_UPLOAD_UNCONFIRMED' });
      safe(() => V.metro.common.FluxDispatcher?.dispatch?.({ type: 'GUILD_STICKERS_CREATE_SUCCESS', guildId: input.guildId,
        sticker: { ...created, name: created.name ?? input.name, guild_id: created.guild_id ?? input.guildId,
          user_id: created.user_id ?? created.user?.id ?? account,
          user: created.user ?? safe(() => V.metro.findByStoreName('UserStore')?.getCurrentUser?.()) } }));
      return created;
    };
  }
  return { files: legacy.files, resolve };
}
