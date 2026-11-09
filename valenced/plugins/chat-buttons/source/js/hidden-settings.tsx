import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement } from 'react'
import { isActive } from './store'

export const hiddenSettingsId = 'dev.fluttershy2008.hide-blocked-and-ignored-messages'
export const hiddenSettingsLabel = 'Hidden users & servers'

let settings: any
export const setPluginSettings = (api: any) => { settings = api }

// Open the target's native settings route, retaining its live storage and toggles.
// This is a settings shortcut, never a plugin-enable or server-visibility toggle.
export function openHiddenSettings() {
	if (!isActive()) return
	try {
		if (settings?.hasPluginSettings?.(hiddenSettingsId) && typeof settings.openPluginSettings === 'function') {
			settings.openPluginSettings(hiddenSettingsId)
			return
		}
	} catch {}
	const { AlertModal, AlertActionButton } = Design as any
	AlertActionCreators.openAlert('chatbuttons-hidden-settings-unavailable',
		createElement(AlertModal, {
			title: 'Hidden users & servers',
			content: 'Enable HideBlockedAndIgnoredMessages in Valenced, then open this shortcut again.',
			actions: createElement(AlertActionButton, { text: 'OK', variant: 'primary' }),
		}))
}
