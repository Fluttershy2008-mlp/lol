/* SPDX-License-Identifier: CC0-1.0 */
const historyRows = value => Array.isArray(value) ? value : value?._array;
const snowflake = id => typeof id === 'string' && /^[1-9]\d*$/.test(id);
const compareIds = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Rendering sees a projection; history actions need the real collection to
// choose cursors. Otherwise an empty projected page has no pagination cursor.
export function createPagination({ getMessages, shouldHide, selectedChannel, fetchMessages,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let nativeDepth = 0, stopped = false, timer, epoch = 0;
  let channel, attempted = new Set(), pages = 0, busy = false, failed = false;
  let requestedBefore = false, hiddenPage = false;
  const maxPages = 5;

  function runNative(fn) {
    nativeDepth++;
    try { return fn(); } finally { nativeDepth--; }
  }
  function runDisplay(fn) {
    const depth = nativeDepth;
    nativeDepth = 0;
    try { return fn(); } finally { nativeDepth = depth; }
  }
  function currentChannel() {
    try { return selectedChannel?.(); } catch { return undefined; }
  }
  function reset() {
    epoch++;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    channel = undefined; attempted = new Set(); pages = 0; busy = failed = false;
    requestedBefore = hiddenPage = false;
  }
  function inspect(id) {
    const collection = getMessages(id), rows = historyRows(collection);
    if (!Array.isArray(rows) || !rows.length) return;
    const ids = rows.map(row => row?.id).filter(snowflake).sort(compareIds);
    if (!ids.length) return;
    return { collection, rows, oldest: ids[0], newest: ids[ids.length - 1] };
  }
  function canContinue(info) {
    const c = info?.collection;
    // Unknown flags/array-only builds have no proven history boundary. Leave
    // their native Load more control alone rather than guessing end-of-history.
    return c && c.hasMoreBefore === true && c.hasMoreAfter === false
      && c.ready !== false && !c.loadingMore && !c.loadingMoreBefore && !c.loadingMoreAfter
      && !c.loading && !c.isLoading && (hiddenPage || info.rows.every(shouldHide));
  }
  function consider(id) {
    if (stopped || nativeDepth || !fetchMessages || !id || currentChannel() !== id) return;
    if (channel !== id) { reset(); channel = id; }
    if (timer !== undefined || busy || failed || pages >= maxPages) return;
    const info = inspect(id);
    if (!canContinue(info) || attempted.has(info.oldest)) return;
    const session = epoch;
    // Schedule outside getMessages/render and Flux dispatch. Never recursively
    // dispatch or fetch while Discord is constructing a native message row.
    timer = setTimer(() => {
      timer = undefined;
      if (stopped || session !== epoch || currentChannel() !== id) return;
      const latest = inspect(id);
      if (!canContinue(latest) || attempted.has(latest.oldest)) return;
      attempted.add(latest.oldest); pages++; busy = true;
      requestedBefore = true;
      let result;
      try {
        result = runNative(() => fetchMessages({ channelId: id, before: latest.oldest, limit: 50 }));
      } catch { busy = false; failed = true; return; }
      // Native success/failure dispatches handle actions that return void. A
      // rejected promise must never produce retries or an unhandled rejection.
      Promise.resolve(result).then(() => {
        if (stopped || session !== epoch) return;
        busy = false;
        consider(id);
      }, () => {
        if (stopped || session !== epoch) return;
        busy = false; failed = true;
      });
    }, 250);
  }
  function observe(event) {
    const type = event?.type;
    if (['LOGOUT', 'CONNECTION_OPEN', 'CHANNEL_SELECT'].includes(type)) { reset(); return; }
    const id = event?.channelId ?? event?.channel_id;
    if (!id || id !== channel) return;
    if (type === 'LOAD_MESSAGES_FAILURE') { busy = false; failed = true; }
    if (type === 'LOAD_MESSAGES_SUCCESS') {
      busy = false;
      hiddenPage = requestedBefore && Array.isArray(event.messages)
        && event.messages.length > 0 && event.messages.every(shouldHide);
      consider(id);
    }
  }
  function repairOptions(options) {
    if (!options || typeof options !== 'object' || options.jump || options.around
      || options.messageId || options.jumpToMessageId || options.isSearch) return options;
    const id = options.channelId ?? options.channel_id;
    if (!id || Boolean(options.before) === Boolean(options.after)) return options;
    const info = inspect(id);
    if (!info) return options;
    const visible = info.rows.filter(row => !shouldHide(row)).map(row => row?.id).filter(snowflake).sort(compareIds);
    if (!visible.length) return options;
    // Only move an actual display-boundary cursor; explicit jumps and arbitrary
    // anchors must retain exactly the range Discord requested.
    if (options.before === visible[0] && options.before !== info.oldest)
      return { ...options, before: info.oldest };
    if (options.after === visible[visible.length - 1] && options.after !== info.newest)
      return { ...options, after: info.newest };
    return options;
  }
  function manualRequest(options) {
    if (nativeDepth) return;
    const id = options?.channelId ?? options?.channel_id;
    if (!id || currentChannel() !== id) return;
    reset(); channel = id;
    busy = true;
    requestedBefore = Boolean(options.before) && !options.after && !options.jump && !options.around
      && !options.messageId && !options.jumpToMessageId && !options.isSearch;
    return epoch;
  }
  function finishRequest(ticket, error = false) {
    if (stopped || ticket === undefined || ticket !== epoch) return;
    busy = false;
    if (error) failed = true;
    else consider(channel);
  }
  return { runNative, runDisplay, consider, observe, repairOptions, manualRequest, finishRequest, reset,
    isNative: () => nativeDepth > 0,
    stop() { stopped = true; reset(); } };
}
