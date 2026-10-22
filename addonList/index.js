(() => {
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
// SPDX-License-Identifier: CC0-1.0
// Shared by the separately installable Revenge bundles; no global API changes.
function withRevengeCompatibility(api, factory, pluginName) {
    var active = true;
    var generation = 0;
    var disposers = new Set();
    var warnings = new Set();
    var delayKey = Symbol.for('bunny.api.patcher.delay');
    var raw = api.patcher;
    function warn(message, error) {
        if (warnings.has(message)) return;
        warnings.add(message);
        try { api.logger?.warn?.('[' + pluginName + '] ' + message, error); } catch (_) {}
    }
    function clear() {
        active = false;
        generation++;
        Array.from(disposers).reverse().forEach(function (dispose) { dispose(); });
    }
    function patchKind(kind) {
        function patch(method, parent, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var unpatch;
            var unsubscribe;
            var uiPatch = method === 'render' || method === 'type' || method === 'default';
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                try { unsubscribe?.(); } catch (error) { warn('Could not cancel a module subscription.', error); }
                try { unpatch?.(); } catch (error) { warn('Could not remove a ' + method + ' patch.', error); }
            }
            if (!active) return dispose;
            disposers.add(dispose);
            function install(target) {
                if (cancelled || !active || epoch !== generation) return;
                try {
                    var owner = target;
                    var key = method;
                    // React memo/forwardRef exports are objects, not functions.
                    // Inspect the resolved module, not just the lazy proxy.
                    for (var depth = 0; uiPatch && depth < 8; depth++) {
                        var value = owner?.[key];
                        if (value?.$$typeof === Symbol.for('react.memo')) {
                            owner = value; key = 'type';
                        } else if (value?.$$typeof === Symbol.for('react.forward_ref')) {
                            owner = value; key = 'render';
                        } else break;
                    }
                    if (uiPatch && typeof owner?.[key] !== 'function') {
                        warn('Skipped unavailable Discord component method: ' + method);
                        dispose();
                        return;
                    }
                    var remove = raw[kind](key, owner, function () {
                        if (!active || cancelled || epoch !== generation) {
                            if (kind === 'after') return arguments[1];
                            if (kind === 'instead') return arguments[1].apply(this, arguments[0]);
                            return;
                        }
                        try { return callback.apply(this, arguments); }
                        finally { if (once) dispose(); }
                    });
                    // A module can synchronously unload the plugin while installing.
                    if (cancelled || !active || epoch !== generation) remove?.();
                    else unpatch = remove;
                } catch (error) {
                    dispose();
                    // Required data/action patches must still fail visibly.
                    // Only optional UI methods can safely be skipped.
                    if (!uiPatch) throw error;
                    warn('Skipped incompatible Discord component patch: ' + method, error);
                }
            }
            try {
                var delay = parent?.[delayKey];
                if (typeof delay === 'function') {
                    var cancel = delay.call(parent, function (target) {
                        try { install(target); }
                        catch (error) {
                            // The caller is now Discord's module loader, outside
                            // the plugin loader's onLoad error boundary.
                            warn('Deferred Discord method is unavailable: ' + method, error);
                        }
                    });
                    if (typeof cancel === 'function') {
                        if (cancelled) cancel();
                        else unsubscribe = cancel;
                    }
                } else install(parent);
            } catch (error) {
                dispose();
                if (!uiPatch) throw error;
                warn('Could not resolve Discord component: ' + method, error);
            }
            return dispose;
        }
        patch.await = function (method, promise, callback, once) {
            var epoch = generation;
            var cancelled = false;
            var remove;
            function dispose() {
                if (cancelled) return;
                cancelled = true;
                disposers.delete(dispose);
                remove?.();
            }
            if (!active) return dispose;
            disposers.add(dispose);
            Promise.resolve(promise).then(function (target) {
                if (!cancelled && active && epoch === generation) remove = patch(method, target, callback, once);
            }).catch(function (error) {
                warn('Deferred patch failed: ' + method, error);
                dispose();
            });
            return dispose;
        };
        return patch;
    }
    var guardedPatcher;
    function currentPatcher() {
        if (!guardedPatcher || raw !== api.patcher) {
            raw = api.patcher;
            guardedPatcher = Object.create(raw || null);
            ['before', 'after', 'instead'].forEach(function (kind) {
                if (typeof raw?.[kind] === 'function') Object.defineProperty(guardedPatcher, kind, { value: patchKind(kind), enumerable: true });
            });
        }
        return guardedPatcher;
    }
    var localAPI = Object.create(api);
    Object.defineProperty(localAPI, 'patcher', { get: currentPatcher, enumerable: true });
    // Discord's legacy JS toast bridge can queue a broken ToastContainer on
    // newer Android builds (useToastContainer reads .position of undefined).
    // Keep this adapter per-plugin. Never change api.ui or Discord's global UI.
    function safeToast(message) {
        var label = typeof message === 'string' || typeof message === 'number'
            ? String(message)
            : String(message?.message ?? message?.text ?? '');
        if (!label) return;
        try {
            var nativeToast = api.metro?.common?.ReactNative?.ToastAndroid;
            if (typeof nativeToast?.show === 'function') {
                return nativeToast.show(label, nativeToast.SHORT ?? 0);
            }
        } catch (error) {
            warn('Native Android notification failed.', error);
        }
        warn('Notification logged because the Discord toast bridge is unsafe: ' + label);
    }
    var lastUI, lastToasts, adaptedUI;
    function currentUI() {
        var ui = api.ui;
        if (!ui?.toasts) return ui;
        if (ui !== lastUI || ui.toasts !== lastToasts) {
            lastUI = ui;
            lastToasts = ui.toasts;
            adaptedUI = Object.create(ui);
            var toasts = Object.create(ui.toasts);
            Object.defineProperty(toasts, 'showToast', { value: safeToast, enumerable: true });
            Object.defineProperty(adaptedUI, 'toasts', { value: toasts, enumerable: true });
        }
        return adaptedUI;
    }
    Object.defineProperty(localAPI, 'ui', { get: currentUI, enumerable: true });
    var plugin;
    try { plugin = factory(localAPI); }
    catch (error) { clear(); throw error; }
    if (!plugin || typeof plugin !== 'object') { clear(); throw new Error(pluginName + ': invalid plugin exports'); }
    var result = Object.assign({}, plugin);
    result.onLoad = function () {
        active = true;
        var epoch = generation;
        function failed(error) {
            if (active && epoch === generation) {
                try { result.onUnload(); } catch (cleanupError) { warn('Startup cleanup failed.', cleanupError); }
            }
            throw error;
        }
        try {
            var pending = plugin.onLoad?.apply(this, arguments);
            if (pending && typeof pending.then === 'function') return Promise.resolve(pending).catch(failed);
            return pending;
        } catch (error) {
            return failed(error);
        }
    };
    result.onUnload = function () {
        clear();
        return plugin.onUnload?.apply(this, arguments);
    };
    return result;
}
return withRevengeCompatibility(vendetta, function(vendetta) {
return (() => {
  // Vendetta-compatible expression, evaluated with Revenge's per-plugin API.
  function createPlugin(V) {
    const BASE_LIMIT = 2000, NITRO_LIMIT = 4000;
    const storage = V.plugin.storage;
    let active = false, generation = 0;
    let disposers = [];
    const busy = new Map();
    const optional = fn => { try { return fn(); } catch { return undefined; } };
    const log = error => optional(() => V.logger?.error?.('Addon List', error));
    const find = (...props) => optional(() => V.metro.findByProps(...props));
    const toast = text => optional(() => V.ui?.toasts?.showToast?.(text));

    function notify(channelID, text) {
      const bot = find('sendBotMessage');
      if (channelID && typeof bot?.sendBotMessage === 'function') {
        try {
          const result = bot.sendBotMessage(channelID, text);
          Promise.resolve(result).catch(log);
          return;
        } catch (error) { log(error); }
      }
      toast(text);
    }

    function plain(value, fallback, max = 1500) {
      const text = typeof value === 'string' ? value : '';
      return (text.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim() || fallback).slice(0, max);
    }
    function markdown(value, fallback, max) {
      return plain(value, fallback, max).replace(/([\\`*_~>|\[\]])/g, '\\$1').replace(/@/g, '@\u200b');
    }
    function authors(value) {
      const names = (Array.isArray(value) ? value : value ? [value] : [])
        .slice(0, 20).map(author => markdown(typeof author === 'string' ? author : author?.name, '', 128)).filter(Boolean);
      return names.join(', ') || 'Unknown author';
    }
    function link(value) {
      if (typeof value !== 'string' || !/^https?:\/\/[^\s<>]+$/i.test(value)) return null;
      // Escape Markdown delimiters and prevent URL text from becoming mentions.
      return value.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/@/g, '%40');
    }
    function option(args, name, fallback = false) {
      const arg = (Array.isArray(args) ? args : []).find(item => item?.name === name);
      return arg ? arg.value === true || arg.value === 'true' : Boolean(fallback);
    }

    function messageLimit() {
      // Resolve at use time; Discord's current user may be unavailable on load.
      const userStore = optional(() => V.metro.findByStoreName?.('UserStore')) || find('getCurrentUser');
      const user = optional(() => userStore?.getCurrentUser?.());
      // Full Nitro only. Basic, Classic and unavailable stores use the base cap.
      return user?.premiumType === 2 ? NITRO_LIMIT : BASE_LIMIT;
    }

    async function listText(kind, detailed) {
      const registry = kind === 'Plugin' ? V.plugins?.plugins : V.themes?.themes;
      if (!registry || typeof registry !== 'object') throw new Error(`${kind} storage is unavailable in this Revenge version.`);
      if (typeof V.storage?.awaitSyncWrapper === 'function') await V.storage.awaitSyncWrapper(registry);
      const entries = Object.entries(registry).filter(([, entry]) => entry && typeof entry === 'object')
        .map(([id, entry]) => ({ id, entry, data: (kind === 'Plugin' ? entry.manifest : entry.data) || {} }));
      entries.sort((a, b) => plain(a.data.name, a.id, 128).localeCompare(plain(b.data.name, b.id, 128)));
      const lines = [`**My ${kind} List | ${entries.length} ${kind}${entries.length === 1 ? '' : 's'}**`, ''];
      for (const { id, entry, data } of entries) {
        const name = markdown(data.name, 'Unnamed ' + kind.toLowerCase(), 128);
        const state = kind === 'Plugin' ? (entry.enabled ? 'Enabled' : 'Disabled') : (entry.selected ? 'Selected' : 'Not selected');
        if (detailed) {
          lines.push(`> **Name**: ${name}`, `> **${kind === 'Plugin' ? 'Status' : 'Selected'}**: ${state}`,
            `> **Description**: ${markdown(data.description, 'No description')}`, `> **Authors**: ${authors(data.authors)}`);
          const url = link(entry.id) || link(id);
          // Visible URL, without a link preview or a duplicated hidden target.
          if (url) lines.push(`> **URL**: <${url}>`);
          lines.push('');
        } else lines.push(`> **${name}** — ${state} — ${authors(data.authors)}`);
      }
      if (!entries.length) lines.push(`No ${kind.toLowerCase()}s installed.`);
      return lines.join('\n').trimEnd();
    }

    function split(text, limit) {
      // A URL must stay complete and clickable; never silently shorten it.
      if (text.split('\n').some(line => line.startsWith('> **URL**: <') && line.length > limit))
        throw new Error(`An install URL exceeds the ${limit}-character message limit.`);
      const chunks = [];
      let remaining = text;
      while (remaining.length > limit) {
        const block = remaining.lastIndexOf('\n\n', limit - 2);
        // Keep whole addon details together when practical, then whole lines.
        let end = block >= limit / 2 ? block + 2 : remaining.lastIndexOf('\n', limit - 1) + 1;
        if (end <= 0) end = limit;
        const code = remaining.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff) end--;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    }

    async function copyText(text, label) {
      const clipboard = optional(() => V.metro.common.clipboard) || find('setString');
      if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard is unavailable. Try the private preview option.');
      await clipboard.setString(text);
      toast(label || 'Addon list copied.');
    }

    async function copyList(text, limit, part, session = generation) {
      const chunks = split(text, limit);
      if (part !== undefined && (!Number.isInteger(part) || part < 1 || part > chunks.length))
        throw new Error(`Choose a copy part from 1 to ${chunks.length}.`);
      const index = part === undefined ? 0 : part - 1;
      const label = i => `Copied part ${i + 1}/${chunks.length} (${chunks[i].length}/${limit} characters).`;
      if (chunks.length === 1 || part !== undefined) {
        await copyText(chunks[index], label(index));
        return;
      }
      const confirm = V.ui?.alerts?.showConfirmationAlert;
      if (typeof confirm !== 'function')
        throw new Error(`This list needs ${chunks.length} messages. Use copy with part: 1, then part: 2, and so on.`);
      const { React, ReactNative: RN } = V.metro.common;
      const h = React.createElement;
      const dark = optional(() => RN.Appearance?.getColorScheme?.()) !== 'light';
      const color = dark ? '#f2f3f5' : '#202225';
      const content = h(RN.ScrollView, { style: { maxHeight: 320 } },
        h(RN.Text, { style: { color, marginBottom: 12 } },
          `Part 1 is copied. Choose a part, tap Done, then paste it into Discord. Reopen copy to choose the next part, or use the command's part option. Each part fits the ${limit}-character limit.`),
        ...chunks.map((chunk, i) => h(RN.TouchableOpacity, {
          key: String(i), accessibilityRole: 'button', accessibilityLabel: `Copy part ${i + 1} of ${chunks.length}`,
          style: { padding: 12, marginVertical: 4, borderRadius: 8, backgroundColor: dark ? '#35373c' : '#e3e5e8' },
          onPress: async () => {
            if (!active || session !== generation) return;
            try { await copyText(chunk, label(i)); }
            catch (error) { log(error); toast(plain(error?.message, 'Could not copy part.')); }
          }
        }, h(RN.Text, { style: { color } }, `Copy part ${i + 1}/${chunks.length} — ${chunk.length}/${limit} characters`))));
      await copyText(chunks[0], label(0));
      if (!active || session !== generation) return;
      confirm({ title: 'Copy addon list in parts', content, confirmText: 'Done', onConfirm: () => {} });
    }

    async function sendChunks(channelID, chunks, session) {
      if (!active || session !== generation) return;
      if (busy.has(channelID)) return notify(channelID, 'An addon list is already being sent.');
      const token = {};
      busy.set(channelID, token);
      let sent = 0;
      try {
        // Resolve only when needed: these Discord modules may not exist at startup.
        const actions = find('sendMessage', 'receiveMessage') || find('sendMessage');
        if (typeof actions?.sendMessage !== 'function') throw new Error('Discord message sending is unavailable. Use private preview or copy.');
        for (const content of chunks) {
          if (!active || session !== generation) return;
          const result = await actions.sendMessage(channelID, {
            content,
            // Never ping users or roles named in third-party addon metadata.
            allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
          });
          if (result === false || result?.ok === false || result?.success === false || result?.status >= 400)
            throw new Error('Discord rejected the message.');
          sent++;
        }
      } catch (error) {
        log(error);
        if (active && session === generation) notify(channelID,
          `Could not send the addon list (${sent}/${chunks.length} messages sent). ${plain(error?.message, 'Try again later.')}`);
      } finally {
        if (busy.get(channelID) === token) busy.delete(channelID);
      }
    }

    async function execute(kind, args, ctx, detailedDefault) {
      if (!active) return;
      const session = generation;
      const channelID = ctx?.channel?.id;
      try {
        const text = await listText(kind, option(args, 'detailed', detailedDefault ?? storage[kind === 'Plugin' ? 'pluginListAlwaysDetailed' : 'themeListAlwaysDetailed']));
        if (!active || session !== generation) return;
        const limit = messageLimit();
        if (option(args, 'copy')) {
          const part = (Array.isArray(args) ? args : []).find(item => item?.name === 'part');
          await copyList(text, limit, part ? Number(part.value) : undefined, session);
          return;
        }
        if (!channelID) throw new Error('Open a channel before using this command.');
        const chunks = split(text, limit);
        if (option(args, 'private', option(args, 'ephemeral', storage.privatePreview))) {
          const bot = find('sendBotMessage');
          if (typeof bot?.sendBotMessage !== 'function') throw new Error('Private preview is unavailable. Use copy instead.');
          for (const chunk of chunks) {
            if (!active || session !== generation) return;
            await bot.sendBotMessage(channelID, chunk);
          }
          return;
        }
        if (chunks.length === 1) { await sendChunks(channelID, chunks, session); return; }
        const confirm = V.ui?.alerts?.showConfirmationAlert;
        if (typeof confirm !== 'function') throw new Error('This list needs multiple messages. Use private preview or copy; confirmation is unavailable.');
        let used = false;
        confirm({
          title: 'Send addon list?',
          content: `Your list will send ${chunks.length} messages, each within ${limit} characters, to this channel. Everyone who can read the channel will see it.`,
          confirmText: 'Send list', cancelText: 'Cancel',
          onConfirm: () => {
            if (used) return;
            used = true;
            return sendChunks(channelID, chunks, session);
          },
          onCancel: () => { used = true; }
        });
      } catch (error) {
        log(error);
        if (active && session === generation) notify(channelID, `Could not create the addon list. ${plain(error?.message, 'Try again later.')}`);
      }
      // Do not return a message object: Revenge would send it a second time.
    }

    function listOptions() {
      return [
        { name: 'detailed', description: 'Include descriptions, authors and visible install URLs.', type: 5, required: false },
        { name: 'private', description: 'Show the list only to you in this channel.', type: 5, required: false },
        { name: 'copy', description: 'Copy message-sized parts instead of sending the list.', type: 5, required: false },
        { name: 'part', description: 'With copy: true, copy this part of a long list (starting at 1).', type: 4, required: false, minValue: 1 }
      ];
    }

    function enhanceCorePlugins() {
      if (typeof V.patcher?.after !== 'function') return;
      const module = optional(() => V.metro.common.commands) || find('getBuiltInCommands');
      if (typeof module?.getBuiltInCommands !== 'function') return;
      const session = generation;
      const replacements = new WeakMap();
      const dispose = V.patcher.after('getBuiltInCommands', module, (_args, commands) => {
        if (!active || session !== generation || !Array.isArray(commands)) return commands;
        return commands.map(command => {
          // Only Revenge's local command; leave server/application commands alone.
          if (command?.name !== 'plugins' || command.applicationId !== '-1') return command;
          let replacement = replacements.get(command);
          if (!replacement) {
            const description = 'Send, preview or copy installed plugins with URLs.';
            const options = [
              ...(Array.isArray(command.options) ? command.options.filter(opt => !['detailed', 'private', 'copy', 'part'].includes(opt.name)) : []),
              ...listOptions()
            ].map(opt => ({ ...opt, displayName: opt.displayName || opt.name, displayDescription: opt.displayDescription || opt.description }));
            replacement = { ...command, description, displayDescription: description, untranslatedDescription: description, options,
              execute: (args, ctx) => active && session === generation
                ? execute('Plugin', args, ctx, true)
                : command.execute(args, ctx)
            };
            replacements.set(command, replacement);
          }
          return replacement;
        });
      });
      if (typeof dispose === 'function') disposers.push(dispose);
    }

    function onUnload() {
      active = false;
      generation++;
      busy.clear();
      const old = disposers;
      disposers = [];
      for (const dispose of old.reverse()) { try { dispose(); } catch (error) { log(error); } }
    }
    function onLoad() {
      if (active) return;
      active = true;
      generation++;
      try {
        if (typeof V.commands?.registerCommand !== 'function') throw new Error('Revenge command API is unavailable.');
        for (const kind of ['Plugin', 'Theme']) {
          const dispose = V.commands.registerCommand({
            name: kind.toLowerCase() + '-list',
            displayName: kind.toLowerCase() + '-list',
            description: `Send, privately preview, or copy your ${kind.toLowerCase()} list.`,
            inputType: 1, type: 1, applicationId: '-1',
            options: listOptions(),
            execute: (args, ctx) => execute(kind, args, ctx)
          });
          if (typeof dispose !== 'function') throw new Error('Revenge did not return a command cleanup function.');
          disposers.push(dispose);
        }
        // Optional on older clients; /plugin-list remains available if absent.
        try { enhanceCorePlugins(); } catch (error) { log(error); }
      } catch (error) { onUnload(); throw error; }
    }

    function Settings() {
      const { React, ReactNative: RN } = V.metro.common;
      V.storage?.useProxy?.(storage);
      const dark = RN.useColorScheme?.() !== 'light';
      const color = dark ? '#f2f3f5' : '#202225';
      const muted = dark ? '#b5bac1' : '#4e5058';
      const h = React.createElement;
      const row = (key, label) => h(RN.View, { key, style: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 } },
        h(RN.Text, { style: { flex: 1, color, fontSize: 16, marginRight: 8 } }, label),
        h(RN.Switch, { value: Boolean(storage[key]), onValueChange: value => { storage[key] = value; }, accessibilityLabel: label }));
      const button = kind => h(RN.TouchableOpacity, {
        key: kind, accessibilityRole: 'button', accessibilityLabel: `Copy ${kind.toLowerCase()} list`,
        style: { padding: 14, marginVertical: 6, borderRadius: 8, backgroundColor: dark ? '#35373c' : '#e3e5e8' },
        onPress: async () => {
          const session = generation;
          try {
            const text = await listText(kind, Boolean(storage[kind === 'Plugin' ? 'pluginListAlwaysDetailed' : 'themeListAlwaysDetailed']));
            if (active && session === generation) await copyList(text, messageLimit(), undefined, session);
          }
          catch (error) { log(error); toast(plain(error?.message, 'Could not copy list.')); }
        }
      }, h(RN.Text, { style: { color, fontSize: 16 } }, `Copy ${kind.toLowerCase()} list`));
      return h(RN.ScrollView, { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
        h(RN.Text, { style: { color, fontSize: 22, fontWeight: 'bold', marginBottom: 8 } }, 'Addon List'),
        h(RN.Text, { style: { color: muted, marginBottom: 12 } }, 'Use /plugins, /plugin-list or /theme-list. Revenge’s /plugins shows details and install URLs by default while Addon List is enabled. Copy splits long lists into parts with character counts: 2,000 normally, 4,000 with full Nitro. Long public lists ask before sending multiple messages.'),
        row('pluginListAlwaysDetailed', 'Detailed plugin lists by default'),
        row('themeListAlwaysDetailed', 'Detailed theme lists by default'),
        row('privatePreview', 'Private previews by default'),
        button('Plugin'), button('Theme'),
        h(RN.Text, { style: { color: muted, marginTop: 12 } }, 'The detailed and private command options override these defaults. Copy never posts to a channel.'));
    }

    return { onLoad, onUnload, settings: Settings };
  }
  return createPlugin(vendetta);
})()
}, "Addon List");
})()
