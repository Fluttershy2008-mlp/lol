import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement } from 'react'
import { isActive } from './store'

export const hiddenSettingsId = 'dev.fluttershy2008.hide-blocked-and-ignored-messages'
export const hiddenSettingsLabel = 'Hidden users & servers'

let host: any
let cancelReady: (() => void) | undefined
export const setSettingsHost = (api: any) => {
	cancelReady?.()
	cancelReady = undefined
	host = api
}
const optional = (read: () => any) => { try { return read() } catch {} }

function rootNavigation(api: any) {
	const U = api?.unscoped
	const direct = optional(() => U.discord.modules.mainTabsV2.RootNavigationRef.getRootNavigationRef())
	if (typeof direct?.navigate === 'function') return direct
	const paths = U?.discord?.utils?.modules?.finders
	const imported = optional(() => paths.lookupModuleWithImportedPath('modules/main_tabs_v2/RootNavigationRef.native.tsx')[0])
	const fromPath = optional(() => (imported?.default ?? imported)?.getRootNavigationRef?.())
	if (typeof fromPath?.navigate === 'function') return fromPath
	const finders = U?.modules?.finders
	const found = optional(() => finders.lookupModule(finders.filters.withProps('getRootNavigationRef'), { initialize: false })[0])
	return optional(() => (found?.default ?? found)?.getRootNavigationRef?.())
}

// Open the native route used by the plugin's gear button. Some Valenced builds
// lack pluginSettings or decorate it after startup; neither means the target is off.
export function openHiddenSettings() {
	if (!isActive() || !host) return
	const api = host
	const settings = optional(() => api.pluginSettings)
	try {
		if (typeof settings?.openPluginSettings === 'function'
			&& (typeof settings.hasPluginSettings !== 'function' || settings.hasPluginSettings(hiddenSettingsId))) {
			settings.openPluginSettings(hiddenSettingsId)
			return
		}
	} catch {}
	try {
		const navigation = rootNavigation(api)
		if (typeof navigation?.navigate === 'function') {
			const open = () => {
				if (host === api && isActive()) navigation.navigate(hiddenSettingsId)
			}
			if (navigation.isReady?.() === false) {
				if (typeof navigation.addListener !== 'function') throw Error('Navigation is not ready')
				if (!cancelReady) {
					let remove: any
					const cancel = () => { if (typeof remove === 'function') remove() }
					const ready = () => {
						if (cancelReady !== cancel) return
						cancel(); cancelReady = undefined
						try { open() } catch {}
					}
					cancelReady = cancel
					const unsubscribe = navigation.addListener('ready', ready)
					remove = typeof unsubscribe === 'function' ? unsubscribe : () => navigation.removeListener?.('ready', ready)
				}
			} else open()
			return
		}
	} catch {}
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert('chatbuttons-hidden-settings-unavailable',
		createElement(AlertModal, {
			title: hiddenSettingsLabel,
			content: 'Could not open the native settings page. Use the plugin’s gear icon for now.',
			actions: createElement(AlertActionButton, { text: 'OK', variant: 'primary' }),
		}))
}
