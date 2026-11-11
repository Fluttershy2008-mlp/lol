import type { Account } from '../lib/types'
import type { SharedInbox } from '../lib/inbox'
import { Avatar, getValenced } from './AccountUi'
import type { Palette } from './AccountUi'

export function InboxTab({ inbox, enabled, setEnabled, accounts, currentId, colors, switchAccount }: {
	inbox: SharedInbox; enabled: boolean; setEnabled: (value: boolean) => Promise<void>; accounts: Account[];
	currentId?: string; colors: Palette; switchAccount: (account: Account) => Promise<void>
}) {
	const rev = getValenced()
	const { View, Text, Alert } = rev.react.ReactNative
	const { TableRowGroup, TableSwitchRow, TableRow } = rev.discord.design.Design
	const [refreshStatus, setRefreshStatus] = rev.react.React.useState(null)
	const summaries = inbox.use()?.summaries ?? {}
	const checkedAt = currentId ? summaries[currentId]?.checkedAt : undefined
	const refreshMessage = refreshStatus?.accountId === currentId &&
		(refreshStatus?.saved || refreshStatus?.previousCheck === checkedAt) ? refreshStatus?.message : undefined
	const saved = accounts.filter(account => !account.isBot)
	const current = saved.find(account => account.id === currentId)
	const ordered = current ? [current, ...saved.filter(account => account !== current)] : saved

	return (
		<>
			<View style={{ gap: 6 }}>
				<Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Shared inbox</Text>
				<Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
					See the last recorded unread DM and server mention counts for your added accounts. Each account updates while it’s active.
				</Text>
			</View>
			<TableRowGroup>
				<TableSwitchRow label="Save inbox summaries" subLabel="Keep counts on this device." value={enabled} onValueChange={(value: boolean) => {
					setRefreshStatus(null)
					return setEnabled(value)
				}} />
				{enabled && <TableRow label="Refresh active account" disabled={!current} arrow onPress={async () => {
					const result = await inbox.refresh()
					const message = {
						saved: 'Inbox summary updated.',
						connecting: 'Waiting for Discord to reconnect.',
						switching: 'Waiting for this account to finish switching.',
						unavailable: 'Discord hasn’t provided unread counts yet. Try again after your chats load.',
					}[result]
					setRefreshStatus({ accountId: currentId, saved: result === 'saved', previousCheck: checkedAt, message })
				}} />}
			</TableRowGroup>
			{enabled && refreshMessage ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 14 }}>{refreshMessage}</Text> : null}
			{enabled && (ordered.length ? (
				<TableRowGroup title="Added accounts">
					{ordered.map(account => {
						const summary = summaries[account.id]
						const active = account.id === currentId
						const detail = summary
							? `${summary.unreadDms ?? '—'} unread DM ${summary.unreadDms === 1 ? 'chat' : 'chats'} · ${summary.mentions ?? '—'} server ${summary.mentions === 1 ? 'mention' : 'mentions'}\nChecked ${new Date(summary.checkedAt).toLocaleString()}`
							: 'Waiting for the first check'
						return <TableRow key={account.id} label={`${account.displayName || account.username}${active ? ' · Active' : ''}`}
							subLabel={detail} subLabelLineClamp={4} icon={<Avatar user={account} border={colors.line} />}
							arrow={!active} onPress={active ? undefined : () => switchAccount(account)} />
					})}
				</TableRowGroup>
			) : <Text style={{ color: colors.muted, fontSize: 14 }}>Add a Discord account to start seeing its inbox summary.</Text>)}
			{enabled && Object.keys(summaries).length > 0 && <TableRowGroup>
				<TableRow label="Clear saved summaries" variant="danger" onPress={() => inbox.clear().catch(() => Alert.alert('Could not clear summaries'))} />
			</TableRowGroup>}
		</>
	)
}
