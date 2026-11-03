(() => {
  'use strict';
  // Scrollbar for Valenced: only one measurable, imperative list owns the handle.
  // Keep this as a standalone IIFE for Valenced's native-plugin loader.
  const DEFAULTS = { enabled: true, allLists: true, side: 'right', width: 7,
    opacity: 0.85, color: '#8796FF', track: true, invert: 'auto' };
  const safe = fn => { try { return fn(); } catch { return undefined; } };
  const clamp = (v, low, high) => Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));
  const settingsOf = x => ({
    enabled: x?.enabled !== false,
    allLists: x?.allLists !== false,
    side: x?.side === 'left' ? 'left' : 'right',
    width: [5, 7, 10, 14].includes(x?.width) ? x.width : 7,
    opacity: clamp(Number(x?.opacity ?? 0.85), 0.3, 1),
    color: typeof x?.color === 'string' && /^#[a-f\d]{6}$/i.test(x.color) ? x.color : '#8796FF',
    track: x?.track !== false,
    invert: ['auto', 'yes', 'no'].includes(x?.invert) ? x.invert : 'auto'
  });
  let running, pendingWrites = Promise.resolve();
  const listeners = new Set();
  function announce(session) {
    if (session?.active) session.revision++;
    for (const cb of [...listeners]) safe(cb);
  }
  function dispose(session) {
    if (!session?.active) return;
    session.active = false;
    for (const undo of session.cleanups.splice(0).reverse()) safe(undo);
    session.candidates.clear();
    session.leader = null;
    if (running === session) running = undefined;
    announce(session);
  }
  function start(api) {
    if (running?.active) return;
    const U = api.unscoped, { React, ReactNative: RN } = U.react;
    const h = React.createElement, clone = React.cloneElement;
    const session = {
      active: true, settings: settingsOf(api.jsonStorage?.cache), cleanups: [],
      candidates: new Map(), leader: null, serial: 0, revision: 0,
      diagnostics: { seen: 0, commands: 0, successes: 0, failures: 0, confirmed: 0, filtered: 0 },
      status: 'Waiting for a scrollable list.'
    };
    running = session;
    api.cleanup(() => dispose(session));
    const live = () => running === session && session.active;
    const win = safe(() => RN.Dimensions.get('window')) || { width: 360, height: 780 };
    const minWidth = Math.max(150, (win.width || 360) * 0.44);
    const minHeight = Math.max(170, (win.height || 780) * 0.21);
    const seen = new WeakSet();
    const known = new Map();
    for (const [name, type] of Object.entries({ ScrollView: RN.ScrollView,
      FlatList: RN.FlatList, SectionList: RN.SectionList,
      VirtualizedList: RN.VirtualizedList })) {
      if (type && (typeof type === 'object' || typeof type === 'function')) known.set(type, name);
    }
    const shopify = safe(() => U.externals.shopify.FlashList);
    if (shopify) known.set(shopify, 'FlashList');
    if (shopify?.FlashList) known.set(shopify.FlashList, 'FlashList');
    function typeName(t) {
      return known.get(t) || [t?.displayName, t?.name, t?.render?.displayName,
        t?.render?.name, t?.type?.displayName, t?.type?.name].find(x => typeof x === 'string') || '';
    }
    function itemCount(p) {
      if (Array.isArray(p?.data)) return p.data.length;
      if (Array.isArray(p?.messages)) return p.messages.length;
      if (Array.isArray(p?.items)) return p.items.length;
      if (Array.isArray(p?.sections)) return p.sections.reduce((n, s) => n + (s?.data?.length || 0), 0);
      return safe(() => p?.dataProvider?.getSize?.()) ?? p?.itemCount ?? p?.rowCount ?? 0;
    }
    const RLV = /RecyclerListView|RecyclerList|LargeList|FlashList/i;
    function identify(el) {
      if (!live() || !el || typeof el !== 'object') return null;
      const p = el.props;
      if (!p || p.__valencedScrollbarV3 || p.scrollEnabled === false ||
        p.horizontal || p.isHorizontal || p.accessibilityRole === 'adjustable') return null;
      const name = typeName(el.type);
      if (/Carousel|Horizontal|Pager|Swipe|AnimatedImage|Thumb|Avatar|Header|ItemRenderer|RowRenderer/i.test(name)) return null;
      const nativeList = /ScrollView|FlatList|SectionList|VirtualizedList|FlashList|RecyclerListView|RecyclerList|LargeList/i.test(name);
      const dataList = (typeof p.renderItem === 'function' || typeof p.rowRenderer === 'function'
        || typeof p.renderRow === 'function') && (typeof p.onScroll === 'function'
        || nativeList || p.dataProvider);
      const messages = /ChatMessageList|MessagesList|MessageList|ChannelMessages|ChatList/i.test(name);
      const dms = /DMList|PrivateChannel|DirectMessage|HomeList|InboxList|FriendsList/i.test(name);
      const chatSignals = typeof p.onTapMessage === 'function' && typeof p.onLongPressMessage === 'function';
      // Chat handler components without a ref/onScroll are NOT list surfaces.
      // Wrapping those was responsible for the extra fake bars in beta2.
      const scrollContract = nativeList || dataList || typeof p.onScroll === 'function'
        && (p.scrollRef || p.listRef || p.scrollViewRef || p.recyclerRef);
      if (!scrollContract) return null;
      if (!nativeList && !dataList && !messages && !dms) return null;
      const kind = messages || chatSignals ? 'chat' : dms ? 'inbox' : 'list';
      if (!session.settings.allLists && kind !== 'chat') return null;
      return { name, kind, isRecycler: RLV.test(name) || !!p.dataProvider,
        count: itemCount(p), score: messages || chatSignals ? 3 : dms ? 2 : 1 };
    }
    function scrollMethods(ref, props) {
      const queue = [ref, props?.listRef, props?.scrollRef, props?.scrollViewRef,
        props?.recyclerRef, props?.messageListRef], out = [], visited = new Set();
      while (queue.length && visited.size < 32) {
        const v = queue.shift();
        if (!v || (typeof v !== 'object' && typeof v !== 'function') || visited.has(v)) continue;
        visited.add(v);
        if (['scrollToOffset', 'scrollTo', 'scrollToPosition', 'scrollToIndex',
          'scrollToLocation', 'scrollToEnd', 'scrollToTop'].some(key => typeof v[key] === 'function')) out.push(v);
        for (const child of ['current', '_listRef', '_recyclerRef', '_scrollRef', 'scrollRef',
          '_scrollComponent', '_scrollViewRef', '_scrollView', 'recyclerRef', 'listRef']) {
          if (v[child]) queue.push(v[child]);
        }
        for (const getter of ['getScrollRef', 'getNativeScrollRef', 'getScrollResponder', 'getNode']) {
          const next = safe(() => v[getter]?.());
          if (next) queue.push(next);
        }
      }
      return out;
    }
    function readDimensions(target, count) {
      const v = safe(() => target.getRenderedSize?.()?.height) ??
        safe(() => target.getScrollableNode?.()?.getRenderedSize?.()?.height);
      let c = safe(() => target.getContentDimension?.()?.height);
      if (!(c > 0)) c = safe(() => target._virtualRenderer?.getLayoutManager?.()?.getContentDimension?.()?.height);
      if (!(c > 0) && count > 0) {
        const last = safe(() => target.getLayout?.(count - 1));
        if (last && Number.isFinite(last.y)) c = last.y + (last.height || 0);
      }
      return { viewport: v, content: c };
    }
    function chooseLeader() {
      if (!live()) return;
      let chosen = null;
      for (const candidate of session.candidates.values()) {
        if (!candidate.eligible || !candidate.command || !candidate.visible ||
          candidate.width < minWidth || candidate.height < minHeight ||
          candidate.content <= candidate.height + 16) continue;
        if (!chosen || candidate.activity > chosen.activity ||
          candidate.activity === chosen.activity && candidate.weight > chosen.weight) chosen = candidate;
      }
      const next = chosen?.id ?? null;
      if (next !== session.leader) {
        session.leader = next;
        session.status = chosen ? `${chosen.kind} scrollbar connected (${chosen.method}).`
          : 'No compatible, measurable scroll list on this screen.';
        announce(session);
      }
    }
    function clearCandidate(candidate) {
      if (!session.candidates.delete(candidate.id)) return;
      chooseLeader();
    }
    function send(target, d, y, fraction, count) {
      if (!target) return false;
      try {
        // recyclerlistview expects (x, y, animated), unlike FlatList's
        // single options object. The beta2 object call silently did nothing.
        if (typeof target.scrollToOffset === 'function') {
          if (d.isRecycler || target.scrollToOffset.length >= 2 ||
            /RecyclerListView|RecyclerList/i.test(target.constructor?.name || ''))
            target.scrollToOffset(0, y, false);
          else target.scrollToOffset({ offset: y, animated: false });
          return 'scrollToOffset';
        }
        if (typeof target.scrollToPosition === 'function') {
          target.scrollToPosition(0, y, false); return 'scrollToPosition';
        }
        if (typeof target.scrollTo === 'function') {
          target.scrollTo({ x: 0, y, animated: false }); return 'scrollTo';
        }
        if (typeof target.scrollToIndex === 'function' && count > 0) {
          const index = Math.max(0, Math.min(count - 1, Math.floor(fraction * (count - 1))));
          if (d.isRecycler || target.scrollToIndex.length >= 2) target.scrollToIndex(index, false);
          else target.scrollToIndex({ index, animated: false, viewPosition: 0 });
          return 'scrollToIndex';
        }
        if (typeof target.scrollToLocation === 'function' && count > 0) {
          target.scrollToLocation({ sectionIndex: 0, itemIndex: Math.floor(fraction * (count - 1)), animated: false });
          return 'scrollToLocation';
        }
        if (fraction <= 0.01 && typeof target.scrollToTop === 'function') {
          target.scrollToTop(false); return 'scrollToTop';
        }
        if (fraction >= 0.99 && typeof target.scrollToEnd === 'function') {
          target.scrollToEnd({ animated: false }); return 'scrollToEnd';
        }
      } catch { return false; }
      return false;
    }
    function Overlay({ element, descriptor }) {
      React.useSyncExternalStore(
        React.useCallback(cb => { listeners.add(cb); return () => listeners.delete(cb); }, []),
        () => session.revision, () => 0
      );
      const p = element.props, originalRef = element.ref ?? p.ref;
      const latestProps = React.useRef(p), latestOriginalRef = React.useRef(originalRef);
      latestProps.current = p; latestOriginalRef.current = originalRef;
      const idRef = React.useRef(null);
      if (idRef.current == null) idRef.current = ++session.serial;
      const id = idRef.current;
      const viewRef = React.useRef(null), targetRef = React.useRef(null);
      const bounds = React.useRef({ height: 0, width: 0, content: 0, offset: 0 });
      const [sizes, setSizes] = React.useState({ height: 0, content: 0, width: 0 });
      const translate = React.useRef(new RN.Animated.Value(0)).current;
      const drag = React.useRef({ top: 0, grab: 0 });
      const pendingConfirmation = React.useRef(null);
      const active = live() && session.settings.enabled;
      const reversed = session.settings.invert === 'yes' ||
        session.settings.invert === 'auto' && !!p.inverted;
      const c = session.candidates.get(id);
      const thumb = Math.max(34, sizes.height * sizes.height / Math.max(1, sizes.content));
      const travel = Math.max(0, sizes.height - thumb);
      const visible = active && !!c?.eligible && !!c?.command && session.leader === id &&
        sizes.height > minHeight && sizes.width > minWidth && sizes.content > sizes.height + 16;
      function position() {
        const g = bounds.current;
        const pct = clamp(g.offset / Math.max(1, g.content - g.height), 0, 1);
        const thumbHeight = Math.max(34, g.height * g.height / Math.max(1, g.content));
        translate.setValue(Math.max(0, g.height - thumbHeight) * (reversed ? 1 - pct : pct));
      }
      function updateCandidate(patch = {}, bump = false) {
        if (!live()) return;
        const g = bounds.current;
        const commands = scrollMethods(targetRef.current, latestProps.current);
        const command = commands.length > 0;
        const valid = g.width >= minWidth && g.height >= minHeight && g.content > g.height + 16;
        let entry = session.candidates.get(id);
        if (!entry) {
          entry = { id, activity: ++session.serial, method: 'awaiting drag',
            kind: descriptor.kind, weight: descriptor.score, visible: true };
          session.candidates.set(id, entry);
          session.diagnostics.seen++;
        }
        const previousReady = entry.eligible;
        Object.assign(entry, { width: g.width, height: g.height, content: g.content,
          command, eligible: valid, kind: descriptor.kind });
        if (bump && command && valid) entry.activity = ++session.serial;
        if (!command && previousReady && entry.id === session.leader) session.status = 'Scroll reference lost; handle hidden.';
        chooseLeader();
      }
      function setMetrics(width, height, content) {
        const g = bounds.current;
        const w = Number.isFinite(width) && width > 0 ? width : g.width;
        const v = Number.isFinite(height) && height > 0 ? height : g.height;
        const x = Number.isFinite(content) && content > 0 ? content : g.content;
        if (w === g.width && v === g.height && x === g.content) return;
        g.width = w; g.height = v; g.content = x;
        setSizes(s => s.width !== w || s.height !== v || s.content !== x ?
          { width: w, height: v, content: x } : s);
        position();
        updateCandidate({}, true);
      }
      function estimate(height) {
        if (!descriptor.count || descriptor.count <= 6 || bounds.current.content > height + 16) return;
        const avg = clamp(Number(p.estimatedItemSize ?? p.averageItemSize ?? 64), 36, 120);
        setMetrics(undefined, height, avg * descriptor.count);
      }
      function onLayout(event) {
        const { width, height } = event?.nativeEvent?.layout ?? {};
        setMetrics(width, height);
        if (height) estimate(height);
        safe(() => p.onLayout?.(event));
      }
      function onContentSizeChange(width, height) {
        setMetrics(undefined, undefined, height);
        safe(() => p.onContentSizeChange?.(width, height));
      }
      function onScroll(...args) {
        const event = args[0], e = event?.nativeEvent ?? event ?? {};
        const y = Number.isFinite(args[2]) ? args[2] : e.contentOffset?.y;
        const g = bounds.current;
        if (Number.isFinite(y)) {
          const next = Math.max(0, y);
          const delta = Math.abs(g.offset - next);
          const pending = pendingConfirmation.current;
          if (pending && Math.abs(next - pending.before) > 3) {
            clearTimeout(pending.timer); pendingConfirmation.current = null;
            session.diagnostics.confirmed++;
            session.status = 'Scrolling confirmed (' + descriptor.kind + ').';
          }
          g.offset = next;
          if (delta > 2) updateCandidate({}, true);
        }
        const v = e.layoutMeasurement?.height ?? g.height;
        const w = e.layoutMeasurement?.width ?? g.width;
        const content = e.contentSize?.height ?? g.content;
        setMetrics(w, v, content);
        position();
        // RecyclerListView passes 3 args; preserve all of them.
        return safe(() => p.onScroll?.(...args));
      }
      function setRef(value) {
        targetRef.current = value;
        const savedRef = latestOriginalRef.current;
        if (typeof savedRef === 'function') safe(() => savedRef(value));
        else if (savedRef && typeof savedRef === 'object') savedRef.current = value;
        if (value) {
          const target = scrollMethods(value, latestProps.current)[0];
          if (target) {
            const dims = readDimensions(target, descriptor.count);
            setMetrics(undefined, dims.viewport, dims.content);
          }
        }
        updateCandidate({}, !!value);
      }
      const stableRef = React.useCallback(setRef, []);
      React.useEffect(() => () => {
        if (pendingConfirmation.current) clearTimeout(pendingConfirmation.current.timer);
        pendingConfirmation.current = null;
        clearCandidate({ id });
      }, [id]);
      function move(pageY) {
        if (!live() || session.leader !== id) return;
        const g = bounds.current;
        const height = Math.max(34, g.height * g.height / Math.max(1, g.content));
        const distance = Math.max(1, g.height - height);
        const ratio = clamp((pageY - drag.current.top - drag.current.grab) / distance, 0, 1);
        const fraction = reversed ? 1 - ratio : ratio;
        const y = fraction * Math.max(0, g.content - g.height);
        const commands = scrollMethods(targetRef.current, latestProps.current);
        const before = g.offset;
        let used = false;
        for (const target of commands) {
          used = send(target, descriptor, y, fraction, descriptor.count);
          if (used) break;
        }
        session.diagnostics.commands++;
        if (!used) {
          if (pendingConfirmation.current) clearTimeout(pendingConfirmation.current.timer);
          pendingConfirmation.current = null;
          session.diagnostics.failures++;
          const rec = session.candidates.get(id);
          if (rec) { rec.command = false; session.status = 'List rejected the scroll command; handle hidden.'; }
          chooseLeader(); announce(session);
          return;
        }
        session.diagnostics.successes++;
        if (session.candidates.has(id)) session.candidates.get(id).method = used;
        if (pendingConfirmation.current) clearTimeout(pendingConfirmation.current.timer);
        pendingConfirmation.current = null;
        // A list may accept a command without moving (beta2's exact bug).
        // Confirm via onScroll or a read-only native offset, else hide it.
        if (Math.abs(y - before) > 12) {
          const pending = { before, desired: y, timer: null };
          pendingConfirmation.current = pending;
          pending.timer = setTimeout(() => {
            if (!live() || pendingConfirmation.current !== pending) return;
            pendingConfirmation.current = null;
            const actual = scrollMethods(targetRef.current, latestProps.current)
              .map(ref => safe(() => ref.getCurrentScrollOffset?.()))
              .find(n => Number.isFinite(n));
            if (Number.isFinite(actual) && Math.abs(actual - pending.before) > 3) {
              session.diagnostics.confirmed++; return;
            }
            const rec = session.candidates.get(id);
            if (rec) rec.command = false;
            session.diagnostics.failures++;
            session.status = 'Scroll call did not report movement; hidden for this list.';
            chooseLeader(); announce(session);
          }, 900);
        }
        g.offset = y;
        position();
      }
      const events = {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: e => {
          const n = e?.nativeEvent ?? {};
          const pageY = Number(n.pageY ?? 0), origin = pageY - Number(n.locationY ?? 0);
          const g = bounds.current;
          const height = Math.max(34, g.height * g.height / Math.max(1, g.content));
          const distance = Math.max(0, g.height - height);
          const now = clamp(g.offset / Math.max(1, g.content - g.height), 0, 1);
          const y = distance * (reversed ? 1 - now : now);
          const local = pageY - origin;
          drag.current.top = origin;
          drag.current.grab = local >= y - 10 && local <= y + height + 10 ? local - y : height / 2;
          move(pageY);
        },
        onResponderMove: e => move(Number(e?.nativeEvent?.pageY ?? 0)),
        onResponderTerminationRequest: () => false,
        onResponderRelease: () => {},
        onResponderTerminate: () => {}
      };
      const child = clone(element, { ref: stableRef, __valencedScrollbarV3: true,
        onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 });
      const config = session.settings;
      const trackWidth = Math.max(23, config.width + 15);
      const bar = visible ? h(RN.View, {
        key: 'scrollbar-hit-area', ...events,
        accessible: true, accessibilityRole: 'adjustable',
        accessibilityLabel: 'Drag to scroll list', pointerEvents: 'auto',
        style: { position: 'absolute', top: 0, bottom: 0,
          [config.side]: 0, width: trackWidth, alignItems: 'center', zIndex: 10 }
      },
        config.track ? h(RN.View, { pointerEvents: 'none', style: {
          position: 'absolute', top: 0, bottom: 0, width: config.width + 3,
          backgroundColor: 'rgba(120,125,140,0.11)', borderRadius: config.width } }) : null,
        h(RN.Animated.View, { pointerEvents: 'none', style: {
          width: config.width, height: thumb, borderRadius: config.width,
          opacity: config.opacity, backgroundColor: config.color,
          transform: [{ translateY: translate }] } })
      ) : null;
      return h(RN.View, {
        __valencedScrollbarV3: true, ref: viewRef,
        collapsable: false,
        pointerEvents: 'box-none',
        style: { flex: 1, minWidth: 0, minHeight: 0, position: 'relative' },
        onLayout: e => {
          const w = e?.nativeEvent?.layout?.width;
          const height = e?.nativeEvent?.layout?.height;
          setMetrics(w, height);
          if (height) estimate(height);
        }
      }, child, bar);
    }
    function wrap(el) {
      const descriptor = identify(el);
      if (!descriptor || seen.has(el)) return el;
      seen.add(el);
      return h(Overlay, { element: el, descriptor, key: el.key ?? undefined });
    }
    const factories = new WeakMap();
    function patchFactories(module, methods) {
      if (!module || (typeof module !== 'object' && typeof module !== 'function')) return;
      let used = factories.get(module);
      if (!used) factories.set(module, used = new Set());
      for (const key of methods) {
        if (used.has(key) || typeof module[key] !== 'function') continue;
        used.add(key);
        const undo = safe(() => U.patcher.instead(module, key, function(args, original) {
          const element = Reflect.apply(original, this, args);
          return live() ? wrap(element) : element;
        }));
        if (typeof undo === 'function') session.cleanups.push(undo);
      }
    }
    patchFactories(React, ['createElement']);
    patchFactories(U.react.ReactJSXRuntime, ['jsx', 'jsxs', 'jsxDEV']);
    const F = U.modules?.finders;
    const get = mod => patchFactories(mod, ['jsx', 'jsxs', 'jsxDEV']);
    const remove = safe(() => F?.getModules(F.filters.withProps('jsx', 'jsxs'), get));
    if (typeof remove === 'function') session.cleanups.push(remove);
    safe(() => get(F.lookupModule(F.filters.withProps('jsx', 'jsxs'), { initialize: false })[0]));
    void Promise.resolve(api.jsonStorage?.get?.()).then(data => {
      if (live() && data) { session.settings = settingsOf(data); announce(session); }
    }).catch(() => { if (live()) session.status = 'Could not load saved settings.'; });
  }
  function SettingsComponent({ api }) {
    const { React, ReactNative: RN } = api.unscoped.react, h = React.createElement;
    const [, force] = React.useState(0);
    React.useEffect(() => { const update = () => force(x => x + 1);
      listeners.add(update); return () => listeners.delete(update); }, []);
    const s = running, v = s?.settings ?? settingsOf(api.jsonStorage?.cache);
    function save(patch) {
      if (!s?.active) return;
      s.settings = settingsOf({ ...s.settings, ...patch }); announce(s);
      const next = { ...s.settings };
      pendingWrites = pendingWrites.catch(() => {}).then(() => api.jsonStorage.set(next, true));
      pendingWrites.catch(() => safe(() => RN.ToastAndroid.show('Unable to save Scrollbar settings.', 0)));
    }
    const text = (label, detail) => h(RN.View, { style: { flex: 1, marginRight: 12 } },
      h(RN.Text, { style: { color: '#F2F3F5', fontSize: 16, fontWeight: '600' } }, label),
      h(RN.Text, { style: { color: '#B5BAC1', fontSize: 13, marginTop: 5 } }, detail));
    const toggle = (key, label, detail) => h(RN.View, { key, style: {
      padding: 14, backgroundColor: '#2B2D31', borderRadius: 12,
      flexDirection: 'row', alignItems: 'center', marginBottom: 10 } },
      text(label, detail), h(RN.Switch, { value: v[key], accessibilityLabel: label,
        onValueChange: value => save({ [key]: value }) }));
    const choice = (key, label, variants) => h(RN.View, { key, style: { marginVertical: 9 } },
      h(RN.Text, { style: { color: '#F2F3F5', fontSize: 15, marginBottom: 9 } }, label),
      h(RN.View, { style: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' } }, variants.map(([value, title]) =>
        h(RN.Pressable, { key: value, onPress: () => save({ [key]: value }),
          style: { backgroundColor: v[key] === value ? '#5865F2' : '#2B2D31',
            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9 } },
          h(RN.Text, { style: { color: 'white' } }, title)))));
    const current = s?.candidates.get(s.leader);
    return h(RN.ScrollView, { contentContainerStyle: { padding: 18, paddingBottom: 55 } },
      h(RN.Text, { style: { color: 'white', fontSize: 26, fontWeight: '700', marginBottom: 6 } }, 'Scrollbar'),
      h(RN.Text, { style: { color: '#B5BAC1', lineHeight: 19, marginBottom: 17 } },
        'One working side handle per screen. Drag it to scroll, or use normal finger scrolling.'),
      toggle('enabled', 'Enable scrollbar', 'A handle appears only when a real scrollable list ref is available.'),
      toggle('allLists', 'Include inbox, channels and other lists', 'One active list at a time; avoids extra bars on nested lists.'),
      toggle('track', 'Show track', 'Subtle background beneath the handle.'),
      choice('side', 'Side', [['right', 'Right'], ['left', 'Left']]),
      choice('width', 'Thickness', [[5, 'Thin'], [7, 'Normal'], [10, 'Wide'], [14, 'Extra wide']]),
      choice('invert', 'Direction', [['auto', 'Auto'], ['no', 'Normal'], ['yes', 'Reversed']]),
      choice('color', 'Colour', [['#8796FF', 'Blurple'], ['#FF77AA', 'Pink'], ['#F2F3F5', 'White'], ['#57F287', 'Green']]),
      h(RN.Text, { style: { color: '#B5BAC1', lineHeight: 20, marginTop: 13 } },
        `Status: ${s?.status ?? 'Stopped'}\nActive list: ${current?.kind ?? 'none'}\n` +
        `Detected: ${s?.diagnostics.seen ?? 0}; Scroll attempts: ${s?.diagnostics.commands ?? 0}; ` +
        `Sent: ${s?.diagnostics.successes ?? 0}; Moved: ${s?.diagnostics.confirmed ?? 0}; Errors: ${s?.diagnostics.failures ?? 0}.\n` +
        'A scroll command accepted by a native list still requires handset testing to verify actual movement. ' +
        'If chat scroll is missing, that Discord build may not expose its list ref to plugins.')
    );
  }
  return { default: { jsonStorage: { load: true, default: { ...DEFAULTS } },
    start, stop() { dispose(running); }, SettingsComponent } };
})()
