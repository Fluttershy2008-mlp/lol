import type { JsonStorage } from '@valenced/json-storage'

export interface Account {
	id: string
	username: string
	discriminator: string
	avatar: string | null
	displayName: string
	token: string
	addedAt: number
	isNative?: boolean
	isBot?: boolean
}

export interface MoreAltsStorage {
	accounts: Record<string, Account>
	accountOrder: string[]
	enableCLI: boolean
	confirmBeforeDelete: boolean
	enableUnsafeFeatures: boolean
	addToSidebar: boolean
	enableNativeSwitcher: boolean
	blockOtherAccountNotifications: boolean
	persistentStorageVault: boolean
	exportPasswordHash?: string
}

export const DEFAULT_STORAGE: MoreAltsStorage = {
	accounts: {},
	accountOrder: [],
	enableCLI: true,
	confirmBeforeDelete: true,
	enableUnsafeFeatures: false,
	addToSidebar: true,
	enableNativeSwitcher: true,
	blockOtherAccountNotifications: true,
	persistentStorageVault: true,
}
export async function upgradeLegacyStorage(storage: JsonStorage<MoreAltsStorage>) {
	const current = storage.cache as (Partial<MoreAltsStorage> & {
		settings?: { enableNativeSwitcher?: boolean }
	}) | undefined
	if (!current?.settings) return
	const accounts = Object.fromEntries(Object.entries(current.accounts ?? {}).map(([id, value]) => {
		const account = value as Account & { updatedAt?: number }
		return [id, { ...account, addedAt: account.addedAt ?? account.updatedAt ?? Date.now() }]
	}))
	const { settings, ...data } = current
	await storage.set({
		...DEFAULT_STORAGE,
		...data,
		accounts,
		enableNativeSwitcher: data.enableNativeSwitcher ?? settings.enableNativeSwitcher ?? true,
	}, true)
}
