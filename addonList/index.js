(() => {
  // Vendetta-compatible expression, evaluated with Revenge's per-plugin API.
  function createPlugin(V) {
    const LIMIT = 2000; // Works for both free and Nitro accounts.
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
          const url = link(entry.id || id);
          if (url) lines.push(`> **[Install](${url})**`);
          lines.push('');
        } else lines.push(`> **${name}** — ${state} — ${authors(data.authors)}`);
      }
      if (!entries.length) lines.push(`No ${kind.toLowerCase()}s installed.`);
      return lines.join('\n').trimEnd();
    }

    function split(text) {
      const chunks = [];
      let remaining = text;
      while (remaining.length > LIMIT) {
        let end = remaining.lastIndexOf('\n', LIMIT - 1) + 1;
        if (end < LIMIT / 2) end = LIMIT;
        const code = remaining.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff) end--;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    }

    async function copyText(text) {
      const clipboard = optional(() => V.metro.common.clipboard) || find('setString');
      if (typeof clipboard?.setString !== 'function') throw new Error('Clipboard is unavailable. Try the private preview option.');
      await clipboard.setString(text);
      toast('Addon list copied.');
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

    async function execute(kind, args, ctx) {
      if (!active) return;
      const session = generation;
      const channelID = ctx?.channel?.id;
      try {
        const text = await listText(kind, option(args, 'detailed', storage[kind === 'Plugin' ? 'pluginListAlwaysDetailed' : 'themeListAlwaysDetailed']));
        if (!active || session !== generation) return;
        if (option(args, 'copy')) { await copyText(text); return; }
        if (!channelID) throw new Error('Open a channel before using this command.');
        const chunks = split(text);
        if (option(args, 'private', storage.privatePreview)) {
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
          content: `Your list will send ${chunks.length} messages to this channel. Everyone who can read the channel will see it.`,
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
            options: [
              { name: 'detailed', description: 'Include descriptions and install links.', type: 5, required: false },
              { name: 'private', description: 'Show the list only to you in this channel.', type: 5, required: false },
              { name: 'copy', description: 'Copy the list instead of sending it.', type: 5, required: false }
            ],
            execute: (args, ctx) => execute(kind, args, ctx)
          });
          if (typeof dispose !== 'function') throw new Error('Revenge did not return a command cleanup function.');
          disposers.push(dispose);
        }
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
          try { await copyText(await listText(kind, Boolean(storage[kind === 'Plugin' ? 'pluginListAlwaysDetailed' : 'themeListAlwaysDetailed']))); }
          catch (error) { log(error); toast(plain(error?.message, 'Could not copy list.')); }
        }
      }, h(RN.Text, { style: { color, fontSize: 16 } }, `Copy ${kind.toLowerCase()} list`));
      return h(RN.ScrollView, { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
        h(RN.Text, { style: { color, fontSize: 22, fontWeight: 'bold', marginBottom: 8 } }, 'Addon List'),
        h(RN.Text, { style: { color: muted, marginBottom: 12 } }, 'Use /plugin-list or /theme-list. Commands send to the current channel unless private preview or copy is selected. Long lists ask before sending multiple messages.'),
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
