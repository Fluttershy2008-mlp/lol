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
	const summaries = inbox.use()?.summaries ?? {}
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
				<TableSwitchRow label="Save inbox summaries" subLabel="Keep counts on this device." value={enabled} onValueChange={setEnabled} />
				{enabled && <TableRow label="Refresh active account" disabled={!current} arrow onPress={async () => {
					if (!await inbox.refresh()) Alert.alert('Inbox unavailable', 'Open a chat on your added account and wait for Discord to connect.')
				}} />}
			</TableRowGroup>
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
