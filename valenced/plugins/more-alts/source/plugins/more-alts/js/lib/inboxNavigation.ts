export type InboxKind = 'any' | 'dm' | 'mention'
export type InboxOpenResult = 'opened' | 'empty' | 'switch-failed' | 'timed-out' | 'unavailable' | 'cancelled'

export function attempt<T>(read: () => T): T | undefined {
	try { return read() } catch { return undefined }
}

function values(value: any): any[] | undefined {
	if (!value || typeof value !== 'object') return undefined
	return typeof value.values === 'function' ? [...value.values()] : Object.values(value)
}

function snowflake(value: unknown): string | undefined {
	return typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : undefined
}

function compareIds(left = '', right = '') {
	return left.length - right.length || left.localeCompare(right)
}

export function unreadDmChannels(channels: any, read: any) {
	if (typeof read?.hasUnread !== 'function') return undefined
	const entries = values(attempt(() => channels?.getMutablePrivateChannels?.())
		?? attempt(() => channels?.getPrivateChannels?.()) ?? attempt(() => channels?.getSortedPrivateChannels?.()))
	if (!entries) return undefined
	const unread = new Map<string, any>()
	for (const entry of entries) {
		const item = entry?.channel ?? entry
		const channel = typeof item === 'string' ? channels.getChannel?.(item) : item
		const id = snowflake(channel?.id)
		if (id && (channel.type === 1 || channel.type === 3) && read.hasUnread(id)) unread.set(id, channel)
	}
	return unread
}

function guildIdFor(channel: any) {
	return snowflake(channel?.getGuildId?.() ?? channel?.guild_id ?? channel?.guildId)
}

export function mentionedGuildChannels(channels: any, read: any) {
	const states = values(read?.getAllReadStates?.(true))
	if (!states || typeof channels?.getChannel !== 'function' || typeof read?.getMentionCount !== 'function') return undefined
	const mentioned = new Map<string, { guildId: string; channel: any; count: number }>()
	for (const state of states) {
		const id = snowflake(state?.channelId)
		if (!id || mentioned.has(id) || (state.type != null && Number(state.type) !== 0)) continue
		const channel = channels.getChannel(id)
		const guildId = guildIdFor(channel) ?? snowflake(state?._guildId)
		if (!guildId) continue
		const count = read.getMentionCount(id)
		if (Number.isSafeInteger(count) && count > 0) mentioned.set(id, { guildId, channel, count })
	}
	return mentioned
}

type Target = { guildId: string; channelId: string; messageId?: string; newest?: string }

function newestTarget(targets: Iterable<Target>) {
	let newest: Target | undefined
	for (const target of targets) {
		if (!newest || compareIds(target.newest, newest.newest) > 0) newest = target
	}
	return newest
}

function imported(rev: any, path: string) {
	return rev.discord?.utils?.modules?.finders?.lookupModuleWithImportedPath?.(path)?.[0]
}

function lastMessageId(stores: any, channelId: string, channel: any) {
	return snowflake(stores.ReadStateStore?.lastMessageId?.(channelId))
		?? snowflake(channel?.lastMessageId ?? channel?.last_message_id)
		?? snowflake(stores.MessageStore?.getLastMessage?.(channelId)?.id)
}

function findUnreadDm(stores: any) {
	const channels = unreadDmChannels(stores.ChannelStore, stores.ReadStateStore)
	if (!channels) return undefined
	return newestTarget([...channels].map(([channelId, channel]) => {
		const messageId = lastMessageId(stores, channelId, channel)
		return { guildId: '@me', channelId, messageId, newest: messageId ?? channelId }
	}))
}

function findExactMention(rev: any, stores: any, fetched?: any[]) {
	const recent = stores.RecentMentionsStore ?? imported(rev, 'modules/inbox/RecentMentionsStore.tsx')?.default
	const exact: Target[] = []
	for (const message of fetched ?? values(recent?.getMentions?.()) ?? []) {
		const messageId = snowflake(message?.id)
		const channelId = snowflake(message?.getChannelId?.() ?? message?.channel_id ?? message?.channelId)
		if (!messageId || !channelId || !(stores.ReadStateStore?.getMentionCount?.(channelId) > 0)) continue
		const guildId = guildIdFor(stores.ChannelStore?.getChannel?.(channelId))
			?? snowflake(message?.guild_id ?? message?.guildId)
		const ackId = snowflake(stores.ReadStateStore?.ackMessageId?.(channelId))
		if (!guildId || (ackId && compareIds(messageId, ackId) <= 0)) continue
		exact.push({ guildId, channelId, messageId, newest: messageId })
	}
	return newestTarget(exact)
}

async function loadMentions(rev: any, signal: AbortSignal): Promise<any[] | undefined> {
	const finders = rev.modules?.finders
	const module = imported(rev, '../discord_common/js/packages/http-utils/HTTPUtils.tsx')
		?? attempt(() => finders.lookupModule(finders.filters.withProps('HTTP'))[0])
	const http = module?.HTTP
	if (typeof http?.get !== 'function') return
	const request = async () => {
		const response = await http.get({
			url: '/users/@me/mentions', query: { limit: 25, roles: true, everyone: true }, retries: 0,
		})
		return Array.isArray(response?.body) ? response.body : undefined
	}
	let timeout: ReturnType<typeof setTimeout> | undefined
	let stopWaiting: (() => void) | undefined
	const wait = new Promise<undefined>(resolve => {
		stopWaiting = () => resolve(undefined)
		signal.addEventListener('abort', stopWaiting, { once: true })
		timeout = setTimeout(stopWaiting, 3000)
	})
	try {
		return await Promise.race([request(), wait])
	} catch {
		// The channel with the unread mention is still usable when Discord cannot load the message.
		return undefined
	} finally {
		if (timeout !== undefined) clearTimeout(timeout)
		if (stopWaiting) signal.removeEventListener('abort', stopWaiting)
	}
}

export async function openInboxDestination(
	rev: any, stores: any, kind: InboxKind, isReady: () => boolean, signal: AbortSignal,
): Promise<InboxOpenResult> {
	if (!isReady()) return 'cancelled'
	let dm = kind === 'mention' ? undefined : findUnreadDm(stores)
	let mention: Target | undefined
	let hasMentions = false
	if (kind !== 'dm') {
		const channels = mentionedGuildChannels(stores.ChannelStore, stores.ReadStateStore)
		hasMentions = Boolean(channels?.size) || stores.GuildReadStateStore?.getTotalMentionCount?.() > 0
		mention = findExactMention(rev, stores)
		if (!mention && hasMentions) {
			const fetched = await loadMentions(rev, signal)
			if (!isReady()) return 'cancelled'
			if (kind === 'any') dm = findUnreadDm(stores)
			const updated = mentionedGuildChannels(stores.ChannelStore, stores.ReadStateStore)
			hasMentions = Boolean(updated?.size) || stores.GuildReadStateStore?.getTotalMentionCount?.() > 0
			mention = findExactMention(rev, stores, fetched)
				?? newestTarget([...(updated ?? [])]
					.map(([channelId, { guildId, channel }]) => ({
						guildId, channelId, newest: lastMessageId(stores, channelId, channel) ?? channelId,
					})))
		}
	}
	if (!isReady()) return 'cancelled'
	const target = dm && mention ? newestTarget([dm, mention]) : dm ?? mention
	if (!target && !hasMentions) return 'empty'
	const modals = imported(rev, 'actions/ModalActionCreators.tsx')?.default
		?? rev.discord?.actions?.ModalActionCreators
	if (!target) {
		const nav = imported(rev, 'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx')
		if (typeof nav?.navigateToRootTab !== 'function') return 'unavailable'
		modals?.popAll?.()
		const tabs = imported(rev, 'modules/notification_center/NotificationCenterItemsTypes.tsx')?.NotificationCenterTabs
		imported(rev, 'modules/notification_center/NotificationCenterStoreActions.tsx')?.setTab?.(tabs?.Mentions ?? 'Mentions')
		nav.navigateToRootTab({ screen: 'notifications', forceNavigate: true })
		return 'opened'
	}
	const router = imported(rev, 'modules/routing/router_utils.tsx')
	if (typeof router?.transitionToGuild !== 'function') return 'unavailable'
	imported(rev, 'modules/routing/native/RouteManagerUtils.tsx')?.initializeRouteManagerIfNeeded?.()
	modals?.popAll?.()
	router.transitionToGuild(target.guildId, target.channelId, target.messageId, { navigationReplace: true, openChannel: true })
	return 'opened'
}
