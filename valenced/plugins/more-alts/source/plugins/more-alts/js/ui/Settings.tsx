import React from 'react'
import type { PluginApi } from '@valenced/plugins/types'
import { DEFAULT_STORAGE } from '../lib/types'
import type { MoreAltsStorage, Account } from '../lib/types'
import {
	getAllAccounts,
	switchToAccount,
	removeAccount,
	forceLogout,
	exportAccountsJson,
	importAccountsJson,
} from '../lib/accountActions'
import { openAddAccountSheet } from './AddAccountSheet'
import { openAccountSwitcherSheet } from './AccountSwitcherSheet'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { AccountRow, Avatar, getValenced, Glyph, HERO, useCurrentAccount, usePalette } from './AccountUi'
import { InboxTab } from './InboxTab'
import type { SharedInbox } from '../lib/inbox'

export { openAddAccountSheet, openAccountSwitcherSheet }

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

export default function Settings({
	api,
	inbox,
}: {
	api: PluginApi<{ jsonStorage: MoreAltsStorage }>
	inbox?: SharedInbox
}) {
	const rev = getValenced()
	const { ScrollView, View, Alert, Text, Pressable } = rev.react.ReactNative
	const { TableRowGroup, TableSwitchRow, TableRow } = rev.discord.design.Design
	const [tab, setTab] = React.useState<'Accounts' | 'Inbox' | 'Preferences'>('Accounts')
	const colors = usePalette()
	const bottomPadding = useBottomPadding(24)
	const storage = { ...DEFAULT_STORAGE, ...api.jsonStorage.use() } as MoreAltsStorage
	const currentUser = useCurrentAccount()
	const currentUserId = currentUser?.id
	const accounts = getAllAccounts(api.jsonStorage)
	const otherAccounts = accounts.filter(account => account.id !== currentUserId)

	const handleSwitch = async (account: Account) => {
		if (account.id === currentUserId) return
		if (!await switchToAccount(account)) {
			Alert.alert('Could not switch accounts', 'Sign into this account again in Discord, then add it to More Alts.')
		}
	}

	const handleRemove = (account: Account) => {
		const remove = async () => {
			await removeAccount(api.jsonStorage, account.id)
			await inbox?.remove(account.id)
		}
		if (storage.confirmBeforeDelete !== false) {
			Alert.alert(
				'Remove Account',
				`Are you sure you want to remove "${account.username}" from More Alts?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Remove',
						style: 'destructive',
						onPress: () => {
							void remove()
						},
					},
				],
			)
		} else {
			void remove()
		}
	}

	const handleAccountPress = (account: Account) => {
		if (account.id === currentUserId) return
		Alert.alert(
			account.displayName || account.username,
			`Choose an action for @${account.username}:`,
			[
				{
					text: 'Switch to this Account',
					onPress: () => void handleSwitch(account),
				},
				{
					text: 'Remove Account',
					style: 'destructive',
					onPress: () => handleRemove(account),
				},
				{ text: 'Cancel', style: 'cancel' },
			],
		)
	}

	const copyToClipboard = (text: string, successMsg: string) => {
		try {
			const clip =
				rev.discord?.common?.Clipboard ??
				rev.externals?.ReactNativeClipboard
			if (clip?.setString) {
				clip.setString(text)
				Alert.alert('Copied', successMsg)
				return
			}
		} catch {}
		Alert.alert('Copy Failed', 'Unable to access clipboard.')
	}

	const handleExport = () => {
		const json = exportAccountsJson(api.jsonStorage)
		copyToClipboard(
			json,
			`Exported ${accounts.length} accounts to clipboard!`,
		)
	}

	const handleImport = async () => {
		try {
			const clip =
				rev.discord?.common?.Clipboard ??
				rev.externals?.ReactNativeClipboard
			const clipboardText = (await clip?.getString?.()) || ''
			if (!clipboardText.trim()) {
				Alert.alert(
					'Import',
					'Clipboard is empty. Please copy valid export JSON first.',
				)
				return
			}

			const res = await importAccountsJson(api.jsonStorage, clipboardText)
			if (res.success) {
				Alert.alert(
					'Import Complete',
					`Imported ${res.imported} accounts (${res.skipped} skipped duplicates).`,
				)
			} else {
				Alert.alert('Import Failed', res.message || 'Invalid JSON format')
			}
		} catch (e: any) {
			Alert.alert('Import Error', e?.message ?? String(e))
		}
	}

	const confirmLogout = () => Alert.alert(
		'Force Logout',
		'This signs you out of the current Discord session. Your other saved accounts stay in More Alts.',
		[
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Force Logout', style: 'destructive', onPress: () => forceLogout() },
		],
	)

	const toggle = (key: 'enableNativeSwitcher' | 'blockOtherAccountNotifications' | 'enableCLI' |
		'persistentStorageVault' | 'enableUnsafeFeatures' | 'confirmBeforeDelete', label: string, subLabel: string) => (
		<TableSwitchRow label={label} subLabel={subLabel} value={storage[key]}
			onValueChange={(value: boolean) => api.jsonStorage.set({ [key]: value })} />
	)

	return (
		<View style={{ flex: 1, backgroundColor: colors.page }}>
			<View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4,
				marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 16,
				backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line }}>
				{(['Accounts', 'Inbox', 'Preferences'] as const).map(name => (
					<Pressable key={name} accessibilityRole="tab" accessibilityLabel={name}
						accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)}
						style={({ pressed }: { pressed: boolean }) => ({ flex: 1, minHeight: 44, borderRadius: 12,
							flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6,
							backgroundColor: tab === name ? colors.selected : pressed ? colors.mutedPanel : 'transparent' })}>
						<Glyph names={name === 'Accounts' ? ['UserMultipleIcon', 'FriendsIcon'] : name === 'Inbox' ? ['InboxIcon', 'EnvelopeIcon'] : ['SettingsIcon', 'CogIcon']}
							color={tab === name ? colors.text : colors.muted} size={17} />
						<Text style={{ color: tab === name ? colors.text : colors.muted, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>{name}</Text>
					</Pressable>
				))}
			</View>
			<ScrollView key={tab} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding, gap: 20 }}
				keyboardShouldPersistTaps="handled">
				{tab === 'Accounts' ? (
					<>
						<View style={{ overflow: 'hidden', padding: 16, gap: 17, borderRadius: 22,
							borderWidth: 1, borderColor: HERO.line, backgroundColor: HERO.background }}>
							<View pointerEvents="none" style={{ position: 'absolute', right: -41, top: -65, width: 187, height: 187,
								borderRadius: 100, backgroundColor: '#493047', borderColor: '#5b3c55', borderWidth: 1 }} />
							<View pointerEvents="none" style={{ position: 'absolute', right: -21, top: -46, width: 149, height: 149,
								borderRadius: 80, borderColor: '#63425c', borderWidth: 1 }} />
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
								<Avatar user={currentUser} size={62} border={HERO.line} active={!!currentUserId} />
								<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
									<Text style={{ color: HERO.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>CURRENT ACCOUNT</Text>
									<Text numberOfLines={2} style={{ color: HERO.text, fontSize: 23, lineHeight: 28, fontWeight: '800' }}>
									{currentUser?.globalName || currentUser?.username || 'No active session'}
									</Text>
									{currentUser?.username && <Text numberOfLines={1} style={{ color: HERO.muted, fontSize: 13 }}>@{currentUser.username}</Text>}
								</View>
							</View>
							<View style={{ flexDirection: 'row', gap: 9 }}>
								{([
									['Switch account', ['SwapHorizontalIcon', 'ArrowLeftRightIcon'], () => openAccountSwitcherSheet(api.jsonStorage)],
									['Add account', ['PlusIcon', 'ic_add_24px'], () => openAddAccountSheet(api.jsonStorage)],
								] as const).map(([label, icons, onPress], index) => (
									<Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
										style={({ pressed }: { pressed: boolean }) => ({ flex: 1, minHeight: 46, borderRadius: 13,
											flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 5,
											opacity: pressed ? 0.77 : 1, backgroundColor: index ? '#453045' : HERO.accent,
											borderWidth: index ? 1 : 0, borderColor: HERO.line })}>
										<Glyph names={icons} color={index ? HERO.text : HERO.ink} size={17} />
										<Text style={{ color: index ? HERO.text : HERO.ink, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>{label}</Text>
									</Pressable>
								))}
							</View>
						</View>
						<View style={{ gap: 10 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2 }}>
								<Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{currentUserId ? 'Other accounts' : 'Accounts'}</Text>
								<Text style={{ color: colors.muted, fontSize: 13 }}>{otherAccounts.length}</Text>
							</View>
							<View style={{ borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }}>
								{otherAccounts.length ? otherAccounts.map((account, index) => (
									<AccountRow key={account.id} account={account} colors={colors} showTag={storage.enableCLI}
										detail={account.isNative ? 'Discord account' : Number.isFinite(account.addedAt) ? `Added ${formatDate(account.addedAt)}` : undefined}
										divider={index > 0} actionLabel="Account actions" onPress={() => handleAccountPress(account)} />
								)) : (
									<Text style={{ color: colors.muted, fontSize: 14, padding: 16 }}>Add another account to switch between your Discord sessions.</Text>
								)}
							</View>
						</View>
					</>
				) : tab === 'Inbox' ? (
					inbox ? <InboxTab inbox={inbox} enabled={storage.sharedInboxEnabled} accounts={accounts} currentId={currentUserId}
						colors={colors} switchAccount={handleSwitch} setEnabled={value => api.jsonStorage.set({ sharedInboxEnabled: value })} />
						: <Text style={{ color: colors.muted, fontSize: 14 }}>Shared inbox is unavailable on this Valenced version.</Text>
				) : (
					<>
						<TableRowGroup title="Switching">
							{toggle('enableNativeSwitcher', 'Native Account Switcher', 'Show Discord’s built-in switcher on the You tab.')}
							{toggle('blockOtherAccountNotifications', 'Block Background Notifications', 'Mute notifications from your other accounts.')}
							{toggle('enableCLI', 'Show Full Username Tag', 'Show the #1234 suffix when an account has one.')}
						</TableRowGroup>
						<TableRowGroup title="Storage & backup">
							{toggle('persistentStorageVault', 'Persistent Storage Vault', 'Keep a local backup of saved Discord sessions.')}
							<TableRow label="Import Accounts from Clipboard" subLabel="Restore saved accounts from JSON." arrow onPress={handleImport} />
							{toggle('enableUnsafeFeatures', 'Enable Account Export', 'Allow copying saved sessions and tokens as JSON.')}
							{storage.enableUnsafeFeatures && <TableRow label="Export Accounts" subLabel="Copy saved sessions and tokens as JSON." arrow onPress={handleExport} />}
						</TableRowGroup>
						<TableRowGroup title="Account management">
							{toggle('confirmBeforeDelete', 'Confirm Before Removing', 'Ask before removing an account from More Alts.')}
							<TableRow label="Force Logout Session" subLabel="Sign out of the active Discord session." variant="danger" arrow onPress={confirmLogout} />
						</TableRowGroup>
					</>
				)}
			</ScrollView>
		</View>
	)
}
