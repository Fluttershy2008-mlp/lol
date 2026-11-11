import { callNative, otherAccountPushEnabled } from './nativeSwitcher'
import type { MoreAltsStorage } from '../lib/types'

const TOKEN_MANAGER = 'modules/notifications/native/NotificationTokenManager.tsx'
const ACCOUNT_STORE = 'modules/multi_account/MultiAccountStore.tsx'
const YOU_BAR_AVATAR = 'modules/main_tabs_v2/native/you_bar/YouBarAvatar.tsx'
const DOT_POLL_MS = 3000

export default function startOtherAccountPush(api: any) {
	const rev = api.unscoped
	const storage = api.jsonStorage
	const stores = rev.discord?.flux?.Stores
	const finders = rev.discord?.utils?.modules?.finders
	const { React, ReactNative: { AppState, View } } = rev.react
	const cleanups: Array<() => void> = []
	const listeners = new Set<() => void>()
	let accountStore = stores?.MultiAccountStore
	let tokenManager: any
	let pushEnabled = false
	let configuredIds: string | undefined
	let appliedIds: string | undefined
	let pending = false
	let stopped = false
	let interval: ReturnType<typeof setInterval> | undefined
	let refreshing = false
	let state = AppState?.currentState
	let revision = 0

	const setPending = (value: boolean) => {
		if (pending === value) return
		pending = value
		for (const listener of listeners) listener()
	}
	const refreshDot = async () => {
		if (refreshing || stopped || !pushEnabled || !appliedIds || appliedIds !== configuredIds || appliedIds === '[]') return
		refreshing = true
		const current = revision
		try {
			const value = await callNative('hasOtherAccountPush')
			if (!stopped && current === revision) setPending(value === true)
		} finally {
			refreshing = false
		}
	}
	const updatePolling = () => {
		if (interval !== undefined) clearInterval(interval)
		interval = undefined
		if (pushEnabled && appliedIds === configuredIds && appliedIds && appliedIds !== '[]' && (state === 'active' || state == null)) {
			void refreshDot()
			interval = setInterval(refreshDot, DOT_POLL_MS)
		}
	}
	const syncBadgeAccounts = () => {
		const active = stores?.UserStore?.getCurrentUser?.()?.id
		// During a switch the user store can briefly be empty. Keep the last configuration until it settles.
		if (pushEnabled && !active) return
		const users = pushEnabled ? accountStore?.getValidUsers?.() : undefined
		if (pushEnabled && (!Array.isArray(users) || !users.some(user => user?.id === active))) return
		const ids = JSON.stringify((Array.isArray(users) ? users : [])
			.map(user => user?.id)
			.filter(id => typeof id === 'string' && id !== active)
			.sort())
		if (ids === configuredIds) return
		configuredIds = ids
		const current = ++revision
		setPending(false)
		updatePolling()
		void callNative('configureOtherAccountPush', [ids]).then(result => {
			if (stopped || current !== revision) return
			if (result === true) appliedIds = ids
			else configuredIds = undefined
			updatePolling()
		})
	}
	const registerToken = () => {
		if (stopped || !tokenManager?.canSync) return
		try {
			tokenManager.registerToken?.()
		} catch {}
	}
	const onPreferences = () => {
		const enabled = otherAccountPushEnabled(storage.cache as MoreAltsStorage)
		if (enabled === pushEnabled && configuredIds !== undefined) return
		const changed = enabled !== pushEnabled
		pushEnabled = enabled
		syncBadgeAccounts()
		if (changed) registerToken()
	}
	const observe = (store: any) => {
		if (!store?.addChangeListener || !store?.removeChangeListener) return
		store.addChangeListener(syncBadgeAccounts)
		cleanups.push(() => store.removeChangeListener(syncBadgeAccounts))
	}
	const watch = (path: string, callback: (module: any) => void) => {
		const cleanup = finders?.getModuleWithImportedPath?.(path, module => {
			if (!stopped) callback(module)
		})
		if (cleanup) cleanups.push(cleanup)
	}
	onPreferences()
	cleanups.push(storage.subscribe(onPreferences))
	observe(stores?.UserStore)
	observe(accountStore)
	watch(ACCOUNT_STORE, module => {
		const store = module?.default
		if (!store || store === accountStore) return
		accountStore = store
		observe(store)
		syncBadgeAccounts()
	})
	watch(TOKEN_MANAGER, module => {
		tokenManager = module?.default
		if (pushEnabled) registerToken()
	})
	const appState = AppState?.addEventListener?.('change', (next: string) => {
		state = next
		updatePolling()
	})
	if (appState) cleanups.push(() => appState.remove())

	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => listeners.delete(listener)
	}
	const snapshot = () => pending
	function OtherAccountDot() {
		if (!React.useSyncExternalStore(subscribe, snapshot, snapshot)) return null
		return React.createElement(View, {
			pointerEvents: 'none',
			accessible: true,
			accessibilityLabel: 'New notifications on another account',
			style: {
				position: 'absolute', top: -2, right: -2, width: 11, height: 11,
				borderRadius: 6, borderWidth: 1.5, borderColor: '#fff', backgroundColor: '#ed4245',
			},
		})
	}
	watch(YOU_BAR_AVATAR, module => {
		const avatar = module?.default
		if (typeof avatar?.type !== 'function') return
		cleanups.push(rev.patcher.after(avatar, 'type', (result: any) => result &&
			React.createElement(View, { style: { position: 'relative' } },
				result, React.createElement(OtherAccountDot))))
	})
	return () => {
		stopped = true
		if (interval !== undefined) clearInterval(interval)
		setPending(false)
		listeners.clear()
		void callNative('configureOtherAccountPush', ['[]'])
		for (const cleanup of cleanups.reverse()) cleanup()
	}
}
