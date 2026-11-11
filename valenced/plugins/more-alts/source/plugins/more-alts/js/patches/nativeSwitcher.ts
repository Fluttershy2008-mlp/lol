import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage } from '../lib/types'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

export async function callNative(method: string, args: any[] = []): Promise<any> {
	try {
		const rev = getValenced()
		if (typeof rev?.modules?.native?.callNativeMethod === 'function') {
			return await rev.modules.native.callNativeMethod(`dev.fluttershy2008.more-alts.${method}`, args)
		}
	} catch {}
	return null
}

export function otherAccountPushEnabled(storage: MoreAltsStorage | undefined): boolean {
	return storage?.enableNativeSwitcher !== false && storage?.blockOtherAccountNotifications === false
}

export function syncNativeVault(storage: JsonStorage<MoreAltsStorage>) {
	try {
		const current = storage.cache ?? ({} as any)
		if (current.persistentStorageVault === false) return
		const accounts = current.accounts ?? {}
		const json = JSON.stringify(Object.values(accounts))
		void callNative('saveAccounts', [json])
	} catch {}
}

export async function restoreFromNativeVault(storage: JsonStorage<MoreAltsStorage>, active: () => boolean) {
	try {
		if (storage.cache?.persistentStorageVault === false) return
		const raw = await callNative('loadAccounts')
		if (!active() || storage.cache?.persistentStorageVault === false) return
		if (typeof raw === 'string' && raw.trim().startsWith('[')) {
			const list = JSON.parse(raw)
			if (Array.isArray(list) && list.length > 0) {
				const current = storage.cache ?? ({} as any)
				const existing = { ...(current.accounts ?? {}) }
				const order = [...(current.accountOrder ?? [])]
				let changed = false

				for (const acc of list) {
					if (acc?.id && acc?.token && !existing[acc.id]) {
						existing[acc.id] = acc
						if (!order.includes(acc.id)) order.push(acc.id)
						changed = true
					}
				}

				if (changed) {
					await storage.set({ accounts: existing, accountOrder: order })
				}
			}
		}
	} catch {}
}

export default function patchNativeSwitcher(
	storage: JsonStorage<MoreAltsStorage>,
): () => void {
	const cleanups: Array<() => void> = []
	const rev = getValenced()

	try {
		const hookedTargets = new Set<any>()

		const hookStore = (store: any) => {
			if (!store || hookedTargets.has(store)) return
			hookedTargets.add(store)

			const proto = Object.getPrototypeOf(store)
			if (proto && !hookedTargets.has(proto)) {
				hookedTargets.add(proto)
				if (typeof proto.getCanUseMultiAccountMobile === 'function') {
					try {
						cleanups.push(
							rev.patcher.after(
								proto,
								'getCanUseMultiAccountMobile',
								() => {
									if (storage.cache?.enableNativeSwitcher !== false) {
										return true
									}
								},
							),
						)
					} catch {}
				}
				if (typeof proto.getHasLoggedInAccounts === 'function') {
					try {
						cleanups.push(
							rev.patcher.after(
								proto,
								'getHasLoggedInAccounts',
								(ret: any) => {
									if (storage.cache?.enableNativeSwitcher !== false) {
										return true
									}
									return ret
								},
							),
						)
					} catch {}
				}
			}

			if (typeof store.getCanUseMultiAccountMobile === 'function') {
				try {
					cleanups.push(
						rev.patcher.after(
							store,
							'getCanUseMultiAccountMobile',
							() => {
								if (storage.cache?.enableNativeSwitcher !== false) {
									return true
								}
							},
						),
					)
				} catch {}
			}

			if (typeof store.getHasLoggedInAccounts === 'function') {
				try {
					cleanups.push(
						rev.patcher.after(
							store,
							'getHasLoggedInAccounts',
							(ret: any) => {
								if (storage.cache?.enableNativeSwitcher !== false) {
									return true
								}
								return ret
							},
						),
					)
				} catch {}
			}

			try {
				const descriptor = Object.getOwnPropertyDescriptor(store, 'canUseMultiAccountNotifications')
				Object.defineProperty(store, 'canUseMultiAccountNotifications', {
					get: () => otherAccountPushEnabled(storage.cache),
					configurable: true,
				})
				cleanups.push(() => {
					try {
						if (descriptor) Object.defineProperty(store, 'canUseMultiAccountNotifications', descriptor)
						else delete (store as any).canUseMultiAccountNotifications
					} catch {}
				})
			} catch {}

			try {
				store.emitChange?.()
			} catch {}
		}

		const finders = rev.modules?.finders
		const filter = finders?.filters?.withProps?.('getCanUseMultiAccountMobile')

		if (filter && finders?.lookupModule) {
			const [match] = finders.lookupModule(filter)
			hookStore(match)
		}

		if (filter && finders?.getModules) {
			const unsub = finders.getModules(filter, (m: any) => hookStore(m), {
				returnNamespace: true,
			})
			cleanups.push(() => unsub?.())
		}

		const Stores = rev.discord?.flux?.Stores
		let MultiAccountStore = Stores?.MultiAccountStore
		const stopWatching = rev.discord?.utils?.modules?.finders?.getModuleWithImportedPath?.(
			'modules/multi_account/MultiAccountStore.tsx',
			(module: any) => {
				if (!module?.default) return
				MultiAccountStore = module.default
				hookStore(MultiAccountStore)
			},
		)
		if (stopWatching) cleanups.push(stopWatching)
		const UserStore = Stores?.UserStore

		if (MultiAccountStore) {
			hookStore(MultiAccountStore)
		}

		const syncActiveUserToNative = () => {
			const currentUserId = UserStore?.getCurrentUser?.()?.id
			void callNative('setActiveUser', [currentUserId ?? null])
			const shouldBlock = !otherAccountPushEnabled(storage.cache)
			void callNative('setBlockNotifications', [shouldBlock])
			try {
				MultiAccountStore?.emitChange?.()
			} catch {}
		}

		syncActiveUserToNative()
		let vaultEnabled = storage.cache?.persistentStorageVault !== false
		cleanups.push(storage.subscribe(() => {
			syncActiveUserToNative()
			const enabled = storage.cache?.persistentStorageVault !== false
			if (enabled && !vaultEnabled) syncNativeVault(storage)
			vaultEnabled = enabled
		}))
		if (UserStore?.addChangeListener && UserStore?.removeChangeListener) {
			UserStore.addChangeListener(syncActiveUserToNative)
			cleanups.push(() => UserStore.removeChangeListener(syncActiveUserToNative))
		}

		const Dispatcher =
			rev.discord?.flux?.Dispatcher ?? rev.discord?.common?.flux?.Dispatcher
		if (Dispatcher?.subscribe) {
			const handleNotification = (event: any) => {
				if (otherAccountPushEnabled(storage.cache)) return
				const currentUserId = UserStore?.getCurrentUser?.()?.id
				if (!currentUserId) return

				const notifUserId =
							event?.accountId ??
							event?.account_id ??
					event?.recipientId ??
							event?.recipient_id

				if (notifUserId && notifUserId !== currentUserId) {
					event.stopped = true
					if (typeof event.stopPropagation === 'function') {
						event.stopPropagation()
					}
				}
			}

			Dispatcher.subscribe('NOTIFICATION_CREATE', handleNotification)
			cleanups.push(() => {
				Dispatcher.unsubscribe('NOTIFICATION_CREATE', handleNotification)
			})
		}

	} catch (e) {
		console.error('[MoreAlts] patchNativeSwitcher error:', e)
	}

	return () => {
		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
	}
}
