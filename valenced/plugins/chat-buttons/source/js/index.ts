import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after, HookPriority, instead } from '@valenced/patcher'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, isValidElement } from 'react'
import { forced, Hold, markOwn, Popup, Row, setButton, setMenu, skips, swapRow } from './bar'
import { Settings } from './manage'
import { setPluginSettings } from './hidden-settings'
import { Sheet, setHaptics } from './menu'
import { defaults, setStorage, setActive } from './store'
import type { Options } from './store'

// Accept function, memo and forwardRef exports without patching a missing method.
export function target(mod: any, name = 'default'): [any, string] | undefined {
	let holder = mod, key = name
	for (let i = 0; i < 8; i++) {
		const value = holder?.[key]
		if (value?.type) { holder = value; key = 'type' }
		else if (typeof value?.render === 'function') return [value, 'render']
		else return typeof value === 'function' ? [holder, key] : undefined
	}
}

export default plugin<{ jsonStorage: Options }>({
	jsonStorage: { load: true, default: defaults },
	SettingsComponent: Settings,
	async start({ cleanup, jsonStorage, logger, pluginSettings }) {
		let active = true
		const removers: Array<() => unknown> = []
		const own = (remove: any) => {
			if (typeof remove !== 'function') return
			if (active) removers.push(remove)
			else remove()
		}
		cleanup(() => {
			active = false
			setActive(false)
			setPluginSettings(undefined)
			forced.on = false
			for (const remove of removers.splice(0).reverse()) {
				try { remove() } catch (error) { logger?.warn?.(error) }
			}
		})
		if (!jsonStorage.loaded) await jsonStorage.get()
		if (!active) return
		setStorage(jsonStorage)
		setPluginSettings(pluginSettings)
		setActive(true)
		const watch = (path: string, callback: (mod: any) => void) => {
			own(getModuleWithImportedPath<any>(path, mod => {
				if (active) callback(mod)
			}))
		}
		const patch = (mod: any, make: (holder: any, key: string) => any) => {
			const hit = target(mod)
			if (hit) own(make(...hit))
		}
		const path = 'modules/chat_input/native'
		const menu = 'design/components/ContextMenu/native'
		watch(`${path}/action_buttons/ChatInputActionButton.tsx`, mod => {
			setButton(mod.default)
			patch(mod, (holder, key) => instead(holder, key, ([p], real) =>
				!active || skips(p) ? createElement(real, p) : createElement(Hold, { ...p, real }),
				{ priority: HookPriority.HIGHEST }))
		})
		watch(`${path}/action_buttons/ChatInputActions.tsx`, mod => {
			patch(mod, (holder, key) => after(holder, key, result => active ? markOwn(result) : result))
		})
		watch(`${path}/action_buttons/ChatInputRightActions.tsx`, mod => {
			patch(mod, (holder, key) => after(holder, key, result => active && isValidElement(result)
				? { ...result, type: Row, props: { ...result.props, as: result.type } } : result))
		})
		watch(`${path}/ChatInput.tsx`, mod => {
			patch(mod, (holder, key) => after(holder, key, result => active ? swapRow(result) : result))
		})
		watch(`${menu}/ContextMenu.native.tsx`, mod => {
			if (!mod?.ContextMenu) return
			setMenu(mod.ContextMenu)
			own(afterJSX(mod.ContextMenu, el => active && el ? { ...el, type: Popup } as any : el))
		})
		watch(`${menu}/ContextMenuPopout.native.tsx`, mod => {
			if (typeof mod?.ContextMenuPopout !== 'function') return
			own(instead(mod, 'ContextMenuPopout', ([p], real) =>
				active && p?.menu?.items?.[0]?.bar ? createElement(Sheet, p) : real(p)))
		})
		watch('modules/haptics/HapticUtils.native.tsx', setHaptics)
		watch('modules/a11y/native/useIsScreenReaderEnabled.native.tsx', mod => {
			if (typeof mod?.getIsScreenReaderEnabled !== 'function') return
			own(instead(mod, 'getIsScreenReaderEnabled', (args, real) =>
				(active && forced.on) || real(...args)))
		})
	},
})
