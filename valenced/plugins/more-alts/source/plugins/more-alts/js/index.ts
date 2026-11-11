import patchNativeSwitcher, { restoreFromNativeVault, syncNativeVault } from './patches/nativeSwitcher'
import startOtherAccountPush from './patches/accountPush'
import patchTabBarLongPress from './patches/tabBarLongPress'
import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import Settings from './ui/Settings'
import { DEFAULT_STORAGE, upgradeLegacyStorage, type MoreAltsStorage } from './lib/types'
import { startSharedInbox, type SharedInbox } from './lib/inbox'

let sharedInbox: SharedInbox | undefined

export default plugin<{ jsonStorage: MoreAltsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_STORAGE,
	},

	async start(api) {
		let active = true
		api.cleanup(() => { active = false })
		await upgradeLegacyStorage(api.jsonStorage)
		if (!active) return
		try {
			api.cleanup(patchNativeSwitcher(api.jsonStorage))
			api.cleanup(startOtherAccountPush(api))
		} catch (error) {
			api.logger?.warn?.(`[MoreAlts] Native account notifications unavailable: ${error}`)
		}
		await restoreFromNativeVault(api.jsonStorage, () => active)
		if (!active) return
		syncNativeVault(api.jsonStorage)
		try {
			api.cleanup(setupChangelog(api, CHANGELOG))
		} catch {}
		if (api.plugin?.startedLate) {
			try {
				api.plugin.requireReload()
			} catch {}
		}

		const everest =
			(api as any).unscoped?.everest ??
			(api as any).unscoped?.roselib ??
			(valenced as any)?.everest ??
			(valenced as any)?.roselib ??
			(globalThis as any)?.__everest ??
			(globalThis as any)?.__roselib
		everest?.setActivePlugin?.(api.plugin?.manifest?.id ?? 'rosie.more-alts')
		everest?.registerPlugin?.({
			id: api.plugin?.manifest?.id ?? 'rosie.more-alts',
			name: api.plugin?.manifest?.name ?? 'More Alts',
			icon: api.plugin?.manifest?.icon ?? 'UserMultipleIcon',
			author: api.plugin?.manifest?.author ?? 'Rosie',
			description: api.plugin?.manifest?.description ?? '',
			version: api.plugin?.manifest?.version,
			getStatus: () => api.plugin?.status,
			getErrors: () => api.plugin?.errors,
		})

		let unpatchLongPress = () => {}
		try {
			unpatchLongPress = patchTabBarLongPress(api.jsonStorage)
		} catch (e) {
			api.logger?.error(`[MoreAlts] Failed to apply tab bar long press patch: ${e}`)
		}
		try {
			const inbox = startSharedInbox(api)
			sharedInbox = inbox
			api.cleanup(() => {
				inbox?.stop()
				if (sharedInbox === inbox) sharedInbox = undefined
			})
		} catch (error) {
			api.logger?.warn?.(`[MoreAlts] Shared inbox unavailable: ${error}`)
		}

		api.cleanup(unpatchLongPress)
	},

	SettingsComponent(props) {
		return props.api.unscoped.react.React.createElement(Settings, { ...props, inbox: sharedInbox })
	},
})
