import { openServerInfoSheet } from '../ui/openServerInfoSheet'
import { getInfoIcon, waitForGuildsBarGuildMenu } from './modules'

const MENU_LABEL = 'Server Info'

export function patchGuildsBarContextMenu(): () => void {
	let unpatch: (() => void) | undefined

	const unsub = waitForGuildsBarGuildMenu(ns => {
		if (typeof ns?.default !== 'function') return

		unpatch = revenge.patcher.instead(ns, 'default', (args, original) => {
			const items = [...(original(...args) ?? [])]
			const guildId =
				typeof args?.[0] === 'string' ? (args[0] as string) : undefined

			if (guildId != null) {
				if (!items.some((item: any) => item?.label === MENU_LABEL)) {
					items.splice(1, 0, {
						IconComponent: getInfoIcon(),
						label: MENU_LABEL,
						action: () => openServerInfoSheet(guildId),
					})
				}
			}

			return items
		})
	})

	return () => {
		unsub()
		unpatch?.()
	}
}
