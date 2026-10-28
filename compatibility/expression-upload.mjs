// Shared by the mobile SaveAsSticker and Stealmoji ports.
// Resolve on the explicit upload action; never read authentication tokens.
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
      let result;
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
        check();
        result = await rest.post({ url: `/guilds/${input.guildId}/${kind === 'sticker' ? 'stickers' : 'emojis'}`,
          body, oldFormErrors: true, failImmediatelyWhenRateLimited: true });
      }
      if (result?.ok === false || Number(result?.status ?? result?.statusCode) >= 400) throw result;
      const created = result?.body ?? result;
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
