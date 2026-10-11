// Copyright (c) 2026 Fluttershy2008-mlp. SPDX-License-Identifier: MIT

export function extractCodes(content) {
  if (typeof content !== 'string') return [];
  // A separator before the host prevents suffix domains, userinfo and nested
  // redirect URLs from being treated as genuine gift links.
  const pattern = /(?:^|[\s<(\["'])(?:https:\/\/)?(?:discord\.gift\/|(?:www\.)?discord(?:app)?\.com\/gifts\/)([A-Za-z0-9]{16,24})(?=$|[\s>)\]"'.,!?&#])/g;
  return [...new Set(Array.from(content.matchAll(pattern), match => match[1]))];
}

export function createPlugin(V, clock = globalThis) {
  const storage = V.plugin.storage;
  const { React, ReactNative: RN } = V.metro.common;
  const listeners = new Set();
  const cleanup = [];
  let running = false, generation = 0, busy = false, owner = null;
  let started = 0, ready = true, blocked = false, nextRequest = 0;
  let timer = null, api, dispatcher, userStore, icon;
  const queue = [];
  let status = 'Plugin is disabled';
  if (typeof storage.enabled !== 'boolean') storage.enabled = true;
  if (typeof storage.ignoreOwn !== 'boolean') storage.ignoreOwn = true;
  if (typeof storage.notifications !== 'boolean') storage.notifications = true;
  if (!storage.accounts || typeof storage.accounts !== 'object') storage.accounts = {};

  const now = () => clock.Date?.now?.() ?? Date.now();
  const props = (...keys) => { try { return V.metro.findByProps(...keys); } catch { return null; } };
  const changed = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const setStatus = value => { status = value; changed(); };
  const current = () => { try { return userStore?.getCurrentUser?.()?.id || null; } catch { return null; } };
  const data = id => storage.accounts[id] ?? { seen: [], history: [] };
  const save = (id, value) => { storage.accounts = { ...storage.accounts, [id]: value }; };
  const notify = text => {
    if (!storage.notifications) return;
    try { V.ui?.toasts?.showToast?.(text, icon); } catch {}
  };
  function record(job, result, detail) {
    const account = data(job.account);
    save(job.account, { ...account, history: [
      { at: now(), result, detail, channelId: job.channelId, messageId: job.messageId },
      ...(account.history ?? []),
    ].slice(0, 50) });
    changed();
    if (current() === job.account) notify(`Nitro Auto Claim: ${detail}`);
  }
  function cancelQueue() {
    queue.length = 0;
    if (timer != null) clock.clearTimeout(timer);
    timer = null;
    changed();
  }
  function accountChanged() {
    const id = current();
    if (id !== owner) { cancelQueue(); owner = id; started = now(); }
    return id;
  }
  function classify(error) {
    const body = error?.body ?? error?.response?.body ?? {};
    const statusCode = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    if (statusCode === 429) return ['paused', 'Rate limited. Auto claim paused; try again later.'];
    if (statusCode === 401 || statusCode === 403 || body.captcha_key) return ['paused', 'Discord requires manual action. Auto claim paused.'];
    if (body.code === 10038 || statusCode === 404) return ['failed', 'Gift is invalid or expired.'];
    if (body.code === 50050 || body.code === 50051) return ['failed', 'Gift was already claimed.'];
    if (body.code === 50054) return ['failed', 'This account cannot redeem that gift.'];
    // Do not save raw error objects: they can contain request/session details.
    return ['failed', 'Could not claim gift. Check the original link in Discord.'];
  }
  function request(job) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = clock.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject({ status: 429, timeout: true });
      }, 20000);
      const finish = (fn, value) => {
        if (settled) return;
        settled = true; clock.clearTimeout(timeout); fn(value);
      };
      try {
        // Discord's existing REST client supplies authentication. No token is
        // read, stored, requested from the user or sent to another service.
        const promise = api.post({
          url: `/entitlements/gift-codes/${job.code}/redeem`,
          body: { channel_id: job.channelId, payment_source_id: null },
          oldFormErrors: true,
        });
        if (!promise || typeof promise.then !== 'function') {
          finish(reject, { timeout: true }); return;
        }
        promise.then(response => {
          if (response?.ok === false || Number(response?.status) >= 400) finish(reject, response);
          else if (response && (response.ok === true || Number(response.status) >= 200 && Number(response.status) < 300 || response.body)) finish(resolve, response);
          else finish(reject, { timeout: true });
        }, error => finish(reject, error));
      } catch (error) { finish(reject, error); }
    });
  }
  function pump() {
    if (!running || busy || blocked || !ready || !storage.enabled) return;
    if (!accountChanged() || !queue.length) return;
    if (nextRequest > now()) {
      if (timer == null) timer = clock.setTimeout(() => { timer = null; pump(); }, nextRequest - now());
      return;
    }
    const job = queue.shift();
    if (job.account !== current()) { pump(); return; }
    const account = data(job.account);
    // Persist before sending so a reload or repeated embed never replays it.
    save(job.account, { ...account, seen: [...(account.seen ?? []), job.code].slice(-1000) });
    busy = true;
    const run = generation;
    setStatus('Attempting to claim a gift…');
    request(job).then(() => {
      if (!running || run !== generation) return;
      record(job, 'claimed', 'Gift claimed successfully!');
      setStatus('Watching for new gift links');
    }, error => {
      if (!running || run !== generation) return;
      const [result, detail] = error?.timeout
        ? ['paused', 'Request outcome is unknown. Auto claim paused; check the gift manually.']
        : classify(error);
      if (result === 'paused') {
        blocked = true; storage.enabled = false; cancelQueue();
      }
      record(job, result, detail);
      setStatus(detail);
    }).finally(() => {
      busy = false;
      if (!running) return;
      nextRequest = now() + 1500; changed(); pump();
    });
  }
  function message(event, edited = false) {
    if (!running || !ready || blocked || !storage.enabled || event?.optimistic) return;
    const account = accountChanged();
    const m = event?.message;
    if (!account || !m || !/^\d+$/.test(String(m.id)) || !/^\d+$/.test(String(m.channel_id))) return;
    if (m.state && m.state !== 'SENT') return;
    if (storage.ignoreOwn && (!m.author?.id || m.author.id === account)) return;
    const timestamp = new Date(edited ? m.edited_timestamp : m.timestamp).getTime();
    // History loads and old messages never trigger claims. MESSAGE_UPDATE must
    // carry a new edited timestamp, so an embed refresh cannot replay history.
    if (!Number.isFinite(timestamp) || timestamp < started) return;
    for (const code of extractCodes(m.content)) {
      if ((data(account).seen ?? []).includes(code) || queue.some(job => job.account === account && job.code === code)) continue;
      if (queue.length >= 20) { setStatus('Gift queue is full; additional links were skipped.'); break; }
      queue.push({ code, account, channelId: String(m.channel_id), messageId: String(m.id) });
    }
    changed();
    // Leave Flux dispatch before starting a REST call.
    if (timer == null && queue.length) timer = clock.setTimeout(() => { timer = null; pump(); }, 0);
  }
  function subscribe(type, callback) {
    dispatcher.subscribe(type, callback);
    cleanup.push(() => dispatcher.unsubscribe(type, callback));
  }
  function onLoad() {
    if (running) return;
    dispatcher = V.metro.common.FluxDispatcher ?? props('dispatch', 'subscribe');
    try { userStore = V.metro.findByStoreName('UserStore'); } catch {}
    userStore ??= props('getCurrentUser', 'getUser');
    api = props('getAPIBaseURL', 'get', 'post');
    if (!api?.post || !dispatcher?.subscribe || !dispatcher?.unsubscribe || !userStore?.getCurrentUser) {
      throw new Error('Nitro Auto Claim: Discord modules unavailable on this version.');
    }
    running = true; generation++; ready = true; blocked = false;
    started = now(); owner = current(); nextRequest = 0;
    try { icon = V.ui?.assets?.getAssetIDByName?.('GiftIcon'); } catch {}
    try {
      subscribe('MESSAGE_CREATE', event => message(event));
      subscribe('MESSAGE_UPDATE', event => message(event, true));
      for (const type of ['CONNECTION_CLOSED', 'CONNECTION_INTERRUPTED', 'LOGOUT', 'LOGOUT_START', 'LOGIN_SUCCESS']) {
        subscribe(type, () => { ready = false; cancelQueue(); setStatus('Waiting for Discord to connect'); });
      }
      for (const type of ['CONNECTION_OPEN', 'CONNECTION_RESUMED']) {
        subscribe(type, () => { accountChanged(); ready = true; started = now(); setStatus(storage.enabled ? 'Watching for new gift links' : 'Auto claim is paused'); });
      }
      setStatus(storage.enabled ? 'Watching for new gift links' : 'Auto claim is paused');
    } catch (error) { onUnload(); throw error; }
  }
  function onUnload() {
    running = false; generation++; cancelQueue();
    for (const dispose of cleanup.splice(0).reverse()) { try { dispose(); } catch {} }
    setStatus('Plugin is disabled');
  }
  function toggle(value) {
    // Never resume while a request is unresolved.
    if (value && busy) { notify('Wait for the current gift request to finish.'); return; }
    storage.enabled = value; blocked = false; started = now(); cancelQueue();
    setStatus(value ? 'Watching for new gift links' : 'Auto claim is paused');
  }
  function settings() {
    const h = React.createElement;
    const [, refresh] = React.useState(0);
    React.useEffect(() => { const listener = () => refresh(n => n + 1); listeners.add(listener); return () => listeners.delete(listener); }, []);
    const dark = RN.useColorScheme?.() !== 'light';
    const color = dark ? '#f4f4f5' : '#202124', muted = dark ? '#b5bac1' : '#595f68';
    const text = (value, style = {}) => h(RN.Text, { style: { color, fontSize: 15, lineHeight: 21, ...style } }, value);
    const note = value => text(value, { color: muted, marginVertical: 8 });
    const row = (title, value, action) => h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 } },
      h(RN.View, { style: { flex: 1 } }, text(title)), h(RN.Switch, { accessibilityLabel: title, value, onValueChange: action }));
    const history = owner ? data(owner).history ?? [] : [];
    return h(RN.ScrollView, { style: { flex: 1, backgroundColor: dark ? '#18191c' : '#fff' }, contentContainerStyle: { padding: 18, paddingBottom: 60 } },
      text('Nitro Auto Claim', { fontSize: 24, fontWeight: '700', lineHeight: 30 }),
      note(status), note(owner ? `Current account: <@${owner}>` : 'Waiting for a signed-in account'),
      row('Automatically claim new gift links', storage.enabled, toggle),
      row('Ignore my own gift links', storage.ignoreOwn, value => { storage.ignoreOwn = value; changed(); }),
      row('Show result notifications', storage.notifications, value => { storage.notifications = value; changed(); }),
      note('Watches new messages and new edits in servers and DMs received by this app. Claims use the account shown above. Revenge must be running and connected.'),
      note('Already claimed, expired and ineligible gifts cannot be redeemed. Payment, verification and promotional trial links require manual action.'),
      text('Recent attempts', { fontSize: 19, fontWeight: '700', marginTop: 18 }),
      history.length ? null : note('No gifts attempted yet.'),
      ...history.map((entry, index) => h(RN.View, { key: `${entry.at}:${index}`, style: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: dark ? '#333' : '#ddd' } },
        text(entry.detail), note(new Date(entry.at).toLocaleString()),
      )),
      h(RN.Pressable ?? RN.TouchableOpacity, { accessibilityRole: 'button', onPress: () => {
        if (owner) save(owner, { ...data(owner), history: [] }); changed();
      }, style: { paddingVertical: 18 } }, text('Clear history', { color: '#8992ff' })),
      note('Clearing history keeps duplicate protection. Version 1.0.0'),
    );
  }
  return { onLoad, onUnload, settings };
}
