// Shared by the mobile SaveAsSticker and Stealmoji ports.
// Resolve on the explicit upload action; never read authentication tokens.
export async function expressionResponse(value) {
  const seen = new Set();
  async function unwrap(item, depth) {
    if (item == null || depth > 5) return;
    if (typeof item === 'string') { try { return unwrap(JSON.parse(item), depth + 1); } catch { return; } }
    if (typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (typeof item.then === 'function') { try { return unwrap(await item, depth + 1); } catch { return; } }
    if (Array.isArray(item) || (typeof item.id === 'string' && item.id)) return item;
    for (const key of ['body', 'data', 'result', 'response', 'emoji', 'sticker', 'emojis', 'stickers', 'parsedBody']) {
      const parsed = await unwrap(item[key], depth + 1);
      if (parsed) return parsed;
    }
    if (typeof item.json === 'function') {
      try { const parsed = await unwrap(await item.json(), depth + 1); if (parsed) return parsed; } catch {}
    } else {
      const parsed = await unwrap(item.json, depth + 1); if (parsed) return parsed;
    }
    let bodyText;
    try { bodyText = typeof item.text === 'function' ? await item.text() : item.text; } catch {}
    const parsed = await unwrap(bodyText, depth + 1);
    if (parsed) return parsed;
    return typeof item.message === 'string' ? item : undefined;
  }
  return unwrap(value, 0);
}

export function createExpressionUpload(V, env = globalThis) {
  const safe = fn => { try { return fn(); } catch {} };
  const byProps = (...keys) => safe(() => V.metro.findByProps(...keys));
  function files() {
    const getters = [
      () => typeof valenced !== 'undefined' ? valenced.discord?.native?.FileModule : undefined,
      () => typeof revenge !== 'undefined' ? revenge.discord?.native?.FileModule : undefined,
      () => byProps('writeFile', 'removeFile'),
      ...['NativeFileModule', 'RTNFileManager', 'DCDFileManager'].map(name => () =>
        V.metro.common.ReactNative.NativeModules?.[name] ?? env.nativeModuleProxy?.[name]),
    ];
    for (const get of getters) {
      const value = safe(get);
      if (typeof value?.writeFile === 'function' && typeof value?.removeFile === 'function') return value;
    }
  }
  function http() {
    for (const get of [() => V.metro.common.RestAPI, () => V.metro.common.restAPI,
      () => byProps('HTTP')?.HTTP, () => byProps('get', 'post', 'del')]) {
      const value = safe(get);
      if (typeof value?.post === 'function') return value;
    }
  }
  function resolve(kind) {
    if (kind !== 'sticker' && kind !== 'emoji') throw new Error('Unknown expression type.');
    const method = kind === 'sticker' ? 'createGuildSticker' : 'uploadEmoji';
    const actions = byProps(method), native = typeof actions?.[method] === 'function';
    const rest = native ? undefined : http();
    if (!native && !rest) throw new Error('Discord’s signed-in upload API is unavailable. Restart Discord and try again.');
    return async (input, check = () => {}) => {
      check();
      const url = `/guilds/${input.guildId}/${kind === 'sticker' ? 'stickers' : 'emojis'}`;
      let result, baseline;
      const readList = async () => {
        if (typeof rest?.get !== 'function') return;
        check();
        const response = await rest.get({ url, failImmediatelyWhenRateLimited: true });
        check();
        if (response?.ok === false || Number(response?.status ?? response?.statusCode) >= 400) return;
        const list = await expressionResponse(response);
        check();
        return Array.isArray(list) ? list : undefined;
      };
      if (native) result = await actions[method](input);
      else {
        let body;
        if (kind === 'sticker') {
          if (typeof env.FormData !== 'function') throw new Error('Discord’s multipart upload support is unavailable.');
          body = new env.FormData();
          if (typeof body.getParts !== 'function') throw new Error('Discord’s native multipart upload support is unavailable.');
          if (!/^(file|content):\/\//.test(input.uri)) throw new Error('The sticker file is not ready to upload.');
          body.append('name', input.name);
          body.append('tags', input.tags);
          body.append('description', input.description ?? '');
          body.append('file', { uri: input.uri, name: input.mimeType === 'image/gif' ? 'sticker.gif' : 'sticker.png', type: input.mimeType });
        } else body = { name: input.name, image: input.image, roles: input.roles ?? [] };
        // Pick one route before dispatch. Never retry an uncertain POST through
        // a second uploader or wait in a rate-limit queue after the user leaves.
        // Snapshot IDs before creating, so a read-back cannot mistake an
        // existing expression with the same name for this upload.
        try { const before = await readList(); if (before) baseline = new Set(before.map(row => row.id)); } catch { check(); }
        check();
        result = await rest.post({ url,
          body, oldFormErrors: true, failImmediatelyWhenRateLimited: true });
      }
      let created = await expressionResponse(result);
      const status = result?.status ?? result?.statusCode ?? result?.response?.status;
      if (result?.ok === false || Number(status) >= 400)
        throw { status, body: created ?? result?.body };
      check();
      if (!created?.id && !native && baseline) {
        let after;
        try { after = await readList(); } catch { check(); }
        const currentId = safe(() => V.metro.findByStoreName('UserStore')?.getCurrentUser?.()?.id);
        const matches = after?.filter(row => typeof row.id === 'string' && row.id && !baseline.has(row.id)
          && row.name === input.name && (!row.user?.id || row.user.id === currentId)) ?? [];
        if (matches.length === 1) created = matches[0];
      }
      // Some native emoji actions return void after dispatching their own
      // success event. REST creates and native sticker actions return an object.
      if ((!native || kind === 'sticker') && !created?.id)
        throw new Error(`Discord did not confirm the upload. Check the server’s ${kind === 'sticker' ? 'stickers' : 'emoji'} before trying again.`);
      check();
      if (!native && kind === 'sticker') safe(() => V.metro.common.FluxDispatcher?.dispatch?.({
        type: 'GUILD_STICKERS_CREATE_SUCCESS', guildId: input.guildId,
        sticker: { ...created, user: created.user ?? safe(() => V.metro.findByStoreName('UserStore')?.getCurrentUser?.()) },
      }));
      return created;
    };
  }
  return { resolve, files };
}
