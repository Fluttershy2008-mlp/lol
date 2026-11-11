import type { JsonStorage } from '@valenced/json-storage'
import type { Account, MoreAltsStorage } from './types'
import { getAllAccounts, switchToAccount } from './accountActions'
import { attempt, mentionedGuildChannels, openInboxDestination, unreadDmChannels, type InboxKind, type InboxOpenResult } from './inboxNavigation'

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
	open: (account: Account, kind: InboxKind) => Promise<InboxOpenResult>
	clear: () => Promise<void>
	remove: (id: string) => Promise<void>
	stop: () => void
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

function serverMentionCount(guildRead: any, channels: any, read: any): number | null {
	const total = attempt(() => guildRead?.getTotalMentionCount?.())
	if (Number.isSafeInteger(total) && total >= 0) return total
	const mentioned = mentionedGuildChannels(channels, read)
	return mentioned ? [...mentioned.values()].reduce((sum, { count }) => sum + count, 0) : null
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
	let opening: { check: () => void; cancel: () => void } | undefined
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
			const unreadDms = unreadDmChannels(stores.ChannelStore, stores.ReadStateStore)?.size ?? null
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
		if (readyId !== id) {
			cancel()
			readyId = id
			schedule(true)
		}
		opening?.check()
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
	const onConnectionOpen = (event: any) => {
		void Promise.resolve().then(() => {
			if (!event?.user?.id || event.user.id === currentId()) connectedSession()
		})
	}
	if (dispatcher?.subscribe && dispatcher?.unsubscribe) {
		for (const [event, fn] of [
			['CONNECTION_OPEN', onConnectionOpen], ['POST_CONNECTION_OPEN', onConnectionOpen], ['CONNECTION_RESUMED', onConnectionOpen],
			['CONNECTION_CLOSED', disconnected], ['LOGOUT', disconnected],
		] as const) {
			dispatcher.subscribe(event, fn)
			cleanups.push(() => dispatcher.unsubscribe(event, fn))
		}
	}

	async function open(account: Account, kind: InboxKind): Promise<InboxOpenResult> {
		if (!active || !enabled || opening || account.isBot) return 'cancelled'
		const controller = new AbortController()
		const isReady = () => {
			if (!active || !enabled || controller.signal.aborted || readyId !== account.id ||
				currentId() !== account.id || !isConnected()) return false
			const authenticated = attempt(() => stores.AuthenticationStore?.getId?.())
			return authenticated == null || authenticated === account.id
		}
		let check = () => {}
		const ready = new Promise<void>(resolve => {
			check = () => { if (isReady() || controller.signal.aborted) resolve() }
		})
		let finish = (_result: InboxOpenResult) => {}
		const interrupted = new Promise<InboxOpenResult>(resolve => {
			finish = result => {
				controller.abort()
				resolve(result)
				check()
			}
		})
		opening = { check, cancel: () => finish('cancelled') }
		const deadline = setTimeout(() => finish('timed-out'), 15000)
		try {
			return await Promise.race([interrupted, (async (): Promise<InboxOpenResult> => {
				if (currentId() !== account.id && !await switchToAccount(account)) return 'switch-failed'
				check()
				await ready
				return await openInboxDestination(rev, stores, kind, isReady, controller.signal)
			})()])
		} catch {
			return 'unavailable'
		} finally {
			controller.abort()
			clearTimeout(deadline)
			opening = undefined
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
		else if (previous) {
			opening?.cancel()
			void clear().catch(() => {})
		}
	}))
	if (enabled) schedule(true)
	else void clear().catch(() => {})

	return {
		use: () => file.use(),
		open,
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
			opening?.cancel()
			cancel()
			for (const cleanup of cleanups) cleanup()
		},
	}
}
