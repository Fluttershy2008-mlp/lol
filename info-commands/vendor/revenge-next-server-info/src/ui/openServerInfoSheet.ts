import { getActionSheetActionCreators } from '../lib/modules'
import ServerInfoSheet from './ServerInfoSheet'

export function openServerInfoSheet(guildId: string): void {
	try {
		const actions = getActionSheetActionCreators()
		if (actions == null) {
			console.warn('[server-info] action sheet action creators not found')
			return
		}
		const key = `server-info:${guildId}`
		actions.openLazy(Promise.resolve({ default: ServerInfoSheet }), key, {
			guildId,
		})
	} catch (e) {
		console.warn('[server-info] failed to open action sheet', e)
	}
}
