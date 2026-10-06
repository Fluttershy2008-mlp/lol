let container: any
const PLUGIN_ID = 'dev.kmmiio99o.server-info'

export function initKmmiioLib(api: any) {
	container = api
}

/**
 * The library instance, read through the api on every call.
 *
 * The api object is stable but `unscoped.kmmiio` is filled in by the lib
 * plugin's `decorate`, which can land after this plugin's `start` runs. Holding
 * the value instead of the api would freeze `undefined` into the stash and
 * every later call, `forceLoadLazySheets` among them, would stay a no-op.
 */
export function kmmiioLib(): any {
	return container?.unscoped?.kmmiio
}

function log(module: string, action: string, found: boolean) {
	kmmiioLib()?.logUsage?.(PLUGIN_ID, module, action, found)
}

export function getActionSheetActionCreators(): any {
	const result = kmmiioLib()?.getActionSheetActionCreators()
	log('actionSheetCreators', 'resolve', result != null)
	return result
}

export function getGuildStore(): any {
	const result = kmmiioLib()?.getGuildStore()
	log('store:GuildStore', 'resolve', result != null)
	return result
}

export function getUserStore(): any {
	const result = kmmiioLib()?.getUserStore()
	log('store:UserStore', 'resolve', result != null)
	return result
}

export function getGuildRoleStore(): any {
	const result = kmmiioLib()?.getGuildRoleStore()
	log('store:GuildRoleStore', 'resolve', result != null)
	return result
}

export function getGuildChannelStore(): any {
	const result = kmmiioLib()?.getGuildChannelStore()
	log('store:GuildChannelStore', 'resolve', result != null)
	return result
}

export function getGuildMemberCountStore(): any {
	const result = kmmiioLib()?.getGuildMemberCountStore()
	log('store:GuildMemberCountStore', 'resolve', result != null)
	return result
}

export function getGuildHeaderCountsStore(): any {
	const result = kmmiioLib()?.getGuildHeaderCountsStore()
	log('store:GuildHeaderCountsStore', 'resolve', result != null)
	return result
}

export function getBasicGuildStore(): any {
	const result = kmmiioLib()?.getBasicGuildStore()
	log('store:BasicGuildStore', 'resolve', result != null)
	return result
}

export function getGuildMemberStore(): any {
	const result = kmmiioLib()?.getGuildMemberStore()
	log('store:GuildMemberStore', 'resolve', result != null)
	return result
}

export function getRelationshipStore(): any {
	const result = kmmiioLib()?.getRelationshipStore()
	log('store:RelationshipStore', 'resolve', result != null)
	return result
}

export function getHTTPUtils(): any {
	const result = kmmiioLib()?.getHTTPUtils()
	log('httpUtils', 'resolve', result != null)
	return result
}

export function getFetchBasicGuild(): any {
	const result = kmmiioLib()?.getFetchBasicGuild()
	log('fetchBasicGuild', 'resolve', result != null)
	return result
}

export function getRequestMembersById(): any {
	const result = kmmiioLib()?.getRequestMembersById()
	log('requestMembersById', 'resolve', result != null)
	return result
}

/**
 * The profile sheet this plugin opens.
 *
 * The library resolves sheets generically, so each plugin declares the ones it
 * owns. Stable object because the library memoizes per spec.
 */
const PROFILE_SHEET = {
	prop: [
		'showUserProfileActionSheetPostConnection',
		'getUserProfileActionSheetKey',
	],
	anchor: 'openLazy',
} as const

/**
 * Opens a user's profile sheet.
 *
 * Options are passed straight through, since callers differ in whether they
 * carry a `channelId` or a `guildId`.
 */
export function openUserProfileSheet(options: Record<string, unknown>) {
	const sheet = kmmiioLib()?.resolveSheet(PROFILE_SHEET)
	const found = typeof sheet === 'function'
	if (found) sheet(options)
	log('sheets:profile', 'open', found)
}

/** Warms the sheet without opening one, so the first tap is not wasted. */
export function forceLoadLazySheets(): void {
	const found = typeof kmmiioLib()?.resolveSheet?.(PROFILE_SHEET) === 'function'
	log('sheets:lazyLoad', 'forceLoad', found)
}

export function getInfoIcon(): any {
	const result = kmmiioLib()?.getIcon?.('CircleInformationIcon')
	log('icon:CircleInformationIcon', 'resolve', result != null)
	return result
}

export function waitForGuildsBarGuildMenu(
	callback: (ns: any) => void,
): () => void {
	const result = kmmiioLib()?.waitForGuildsBarGuildMenu(callback)
	log('guild:barMenu', 'subscribe', result != null && result !== (() => {}))
	return result ?? (() => {})
}
