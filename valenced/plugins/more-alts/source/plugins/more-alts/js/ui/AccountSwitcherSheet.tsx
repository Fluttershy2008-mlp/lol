import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage, Account } from '../lib/types'
import { getAllAccounts, switchToAccount } from '../lib/accountActions'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { AccountRow, getValenced, useCurrentAccount, usePalette } from './AccountUi'
import { openAddAccountSheet } from './AddAccountSheet'

const key = 'more-alts-quick-switcher'

export function openAccountSwitcherSheet(storage: JsonStorage<MoreAltsStorage>) {
	const rev = getValenced()
	const actions = rev.discord.actions.ActionSheetActionCreators
	if (!actions?.openLazy) return

	function Switcher() {
		const React = rev.react.React
		const { View, ScrollView, Text, Alert } = rev.react.ReactNative
		const { ActionSheet, BottomSheetTitleHeader, ActionSheetCloseButton, Button } = rev.discord.design.Design
		const colors = usePalette()
		const bottomPadding = useBottomPadding(16)
		const [switchingId, setSwitchingId] = React.useState(null)
		const inFlight = React.useRef(false)
		const prefs = storage.use()
		const currentId = useCurrentAccount()?.id
		const accounts = getAllAccounts(storage)
		const current = accounts.find(account => account.id === currentId)
		const sorted = current ? [current, ...accounts.filter(account => account !== current)] : accounts
		const close = () => actions.hideActionSheet(key)

		const handleSwitch = async (account: Account) => {
			if (account.id === currentId || inFlight.current) return
			inFlight.current = true
			setSwitchingId(account.id)
			try {
				if (await switchToAccount(account)) close()
				else Alert.alert('Could not switch accounts', 'Sign into this account again in Discord, then add it to More Alts.')
			} finally {
				inFlight.current = false
				setSwitchingId(null)
			}
		}

		return (
			<ActionSheet header={<BottomSheetTitleHeader title="Switch account" trailing={<ActionSheetCloseButton onPress={close} />} />}>
				<ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomPadding, gap: 13 }}
					keyboardShouldPersistTaps="handled">
					<View style={{ borderRadius: 17, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line }}>
						{sorted.length ? sorted.map((account, index) => {
							const active = account.id === currentId
							return <AccountRow key={account.id} account={account} colors={colors} showTag={prefs?.enableCLI !== false}
								active={active} divider={index > 0} trailing={active ? 'Active' : switchingId === account.id ? 'Switching…' : undefined}
								actionLabel="Switch account" onPress={!active && switchingId == null ? () => handleSwitch(account) : undefined} />
						}) : <Text style={{ color: colors.muted, padding: 16, fontSize: 14 }}>Add an account to start switching.</Text>}
					</View>
					<Button variant="secondary" text="Add account" onPress={() => openAddAccountSheet(storage)} disabled={switchingId != null} />
				</ScrollView>
			</ActionSheet>
		)
	}

	actions.openLazy(Promise.resolve({ default: Switcher }), key, {})
}
