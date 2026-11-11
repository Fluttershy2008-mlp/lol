import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage } from './types'
import { getAllAccounts } from './accountActions'

export interface InboxSummary {
	checkedAt: number
	unreadDms: number | null
	mentions: number | null
}

type InboxData = { summaries: Record<string, InboxSummary> }
type RefreshResult = 'saved' | 'connecting' | 'switching' | 'unavailable'

export interface SharedInbox {
	use: () => InboxData | undefined
	refresh: () => Promise<RefreshResult>
	clear: () => Promise<void>
	remove: (id: string) => Promise<void>
	stop: () => void
}

function attempt<T>(read: () => T): T | undefined {
	try { return read() } catch { return undefined }
}

function resolveConnection(rev: any, stores: any) {
	const gateway = attempt(() => stores.GatewayConnectionStore)
	if (typeof gateway?.isConnected === 'function') return gateway
	const exports = attempt(() => rev.discord.utils?.modules?.finders?.lookupModuleWithImportedPath?.(
		'modules/gateway/GatewayConnectionStore.tsx',
	)?.[0])
	const imported = exports?.default ?? exports
	if (typeof imported?.isConnected === 'function') return imported
	return attempt(() => stores.ConnectionStore)
}

function values(value: any): any[] | undefined {
	if (!value || typeof value !== 'object') return undefined
	return typeof value.values === 'function' ? [...value.values()] : Object.values(value)
}

function unreadDmCount(channels: any, read: any): number | null {
	if (typeof read?.hasUnread !== 'function') return null
	const entries = values(attempt(() => channels?.getMutablePrivateChannels?.())
		?? attempt(() => channels?.getPrivateChannels?.()) ?? attempt(() => channels?.getSortedPrivateChannels?.()))
	if (!entries) return null
	const ids = new Set<string>()
	for (const entry of entries) {
		const item = entry?.channel ?? entry
		const channel = typeof item === 'string' ? channels.getChannel?.(item) : item
		if (typeof channel?.id === 'string' && (channel.type === 1 || channel.type === 3) && read.hasUnread(channel.id)) ids.add(channel.id)
	}
	return ids.size
}

function serverMentionCount(guildRead: any, channels: any, read: any): number | null {
	const total = attempt(() => guildRead?.getTotalMentionCount?.())
	if (Number.isSafeInteger(total) && total >= 0) return total
	const states = values(read?.getAllReadStates?.(true))
	if (!states || typeof channels?.getChannel !== 'function' || typeof read?.getMentionCount !== 'function') return null
	const ids = new Set<string>()
	let mentions = 0
	for (const state of states) {
		const id = state?.channelId
		if (typeof id !== 'string' || ids.has(id) || (state.type != null && Number(state.type) !== 0)) continue
		const channel = channels.getChannel(id)
		if (!(channel?.guild_id ?? channel?.guildId)) continue
		ids.add(id)
		const count = read.getMentionCount(id)
		if (Number.isSafeInteger(count) && count > 0) mentions += count
	}
	return mentions
}

export function startSharedInbox(api: any): SharedInbox | undefined {
	const rev = api.unscoped
	const storage = api.jsonStorage as JsonStorage<MoreAltsStorage>
	const files = rev.jsonStorage
	if (typeof files?.getJsonStorage !== 'function' || typeof files?.pluginStoragePathFor !== 'function') return undefined
	const file = files.getJsonStorage(files.pluginStoragePathFor(api.plugin.manifest.id, 'inbox.json'), {
		default: { summaries: {} },
	}) as JsonStorage<InboxData>
	const stores = rev.discord.flux.Stores
	const connection = resolveConnection(rev, stores)
	const currentId = () => stores.UserStore?.getCurrentUser?.()?.id
	const isConnected = () => attempt(() => connection?.isConnected?.()) === true
	const cleanups: Array<() => void> = []
	let active = true
	let enabled = storage.cache?.sharedInboxEnabled === true
	let connected = isConnected()
	let readyId = connected ? currentId() : undefined
	let generation = 0
	let timer: ReturnType<typeof setTimeout> | undefined
	let pendingRefresh = false
	let writes = Promise.resolve(file.get()).then(() => {}, () => {})

	function enqueue(update: (data: InboxData) => InboxData | undefined) {
		const write = writes.then(async () => {
			if (!active) return false
			const next = update({ summaries: file.cache?.summaries ?? {} })
			if (next) await file.set(next, true)
			return Boolean(next)
		})
		writes = write.then(() => {}, () => {})
		return write
	}

	async function capture(force: boolean): Promise<boolean> {
		const id = currentId()
		if (!active || !enabled || !id || id !== readyId || !isConnected()) return false
		const added = () => getAllAccounts(storage).some(account => account.id === id && !account.isBot)
		try {
			if (!added()) return false
			const unreadDms = unreadDmCount(stores.ChannelStore, stores.ReadStateStore)
			const mentions = serverMentionCount(stores.GuildReadStateStore, stores.ChannelStore, stores.ReadStateStore)
			if (unreadDms === null && mentions === null) return false
			const checkedAt = Date.now()
			const epoch = generation
			return await enqueue(data => {
				if (!enabled || epoch !== generation || id !== currentId() || !isConnected() || !added()) return undefined
				const previous = data.summaries[id]
				if (!force && previous?.unreadDms === unreadDms && previous?.mentions === mentions) return undefined
				return { summaries: { ...data.summaries, [id]: { checkedAt, unreadDms, mentions } } }
			})
		} catch {
			return false
		}
	}

	function cancel() {
		if (timer !== undefined) clearTimeout(timer)
		timer = undefined
		pendingRefresh = false
		generation++
	}

	function schedule(force = false) {
		if (!active || !enabled || !readyId) return
		pendingRefresh ||= force
		if (timer !== undefined) return
		timer = setTimeout(() => {
			timer = undefined
			const refresh = pendingRefresh
			pendingRefresh = false
			void capture(refresh)
		}, 600)
	}

	function disconnected() {
		connected = false
		readyId = undefined
		cancel()
	}

	function connectedSession() {
		if (!active || !isConnected()) return
		connected = true
		const id = currentId()
		if (readyId === id) return
		cancel()
		readyId = id
		schedule(true)
	}

	function listen(store: any, fn: () => void) {
		if (!store?.addChangeListener || !store?.removeChangeListener) return
		store.addChangeListener(fn)
		cleanups.push(() => store.removeChangeListener(fn))
	}
	listen(connection, () => {
		if (!isConnected()) disconnected()
		else if (!connected) connectedSession()
	})
	listen(stores.UserStore, () => {
		if (readyId && readyId !== currentId()) {
			readyId = undefined
			cancel()
		}
	})
	for (const store of [stores.ChannelStore, stores.ReadStateStore, stores.GuildReadStateStore, stores.MultiAccountStore]) {
		listen(store, () => schedule())
	}
	const dispatcher = rev.discord.flux.Dispatcher ?? rev.discord.common?.flux?.Dispatcher
	const onConnectionOpen = () => { void Promise.resolve().then(connectedSession) }
	if (dispatcher?.subscribe && dispatcher?.unsubscribe) {
		for (const [event, fn] of [
			['CONNECTION_OPEN', onConnectionOpen], ['CONNECTION_RESUMED', onConnectionOpen],
			['CONNECTION_CLOSED', disconnected], ['LOGOUT', disconnected],
		] as const) {
			dispatcher.subscribe(event, fn)
			cleanups.push(() => dispatcher.unsubscribe(event, fn))
		}
	}

	async function clear() {
		cancel()
		await enqueue(data => Object.keys(data.summaries).length ? { summaries: {} } : undefined)
	}
	cleanups.push(storage.subscribe(() => {
		const previous = enabled
		enabled = storage.cache?.sharedInboxEnabled === true
		if (enabled) schedule(!previous)
		else if (previous) void clear().catch(() => {})
	}))
	if (enabled) schedule(true)
	else void clear().catch(() => {})

	return {
		use: () => file.use(),
		async refresh() {
			if (!isConnected()) return 'connecting'
			if (currentId() !== readyId) return 'switching'
			cancel()
			return await capture(true) ? 'saved' : 'unavailable'
		},
		clear,
		async remove(id) {
			await enqueue(data => {
				if (!Object.hasOwn(data.summaries, id)) return undefined
				const summaries = { ...data.summaries }
				delete summaries[id]
				return { summaries }
			})
		},
		stop() {
			active = false
			cancel()
			for (const cleanup of cleanups) cleanup()
		},
	}
}
