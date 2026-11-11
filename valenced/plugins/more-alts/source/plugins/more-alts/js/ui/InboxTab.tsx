import type { Account } from '../lib/types'
import type { SharedInbox } from '../lib/inbox'
import type { InboxKind } from '../lib/inboxNavigation'
import { Avatar, getValenced } from './AccountUi'
import type { Palette } from './AccountUi'

export function InboxTab({ inbox, enabled, setEnabled, accounts, currentId, colors }: {
	inbox: SharedInbox; enabled: boolean; setEnabled: (value: boolean) => Promise<void>; accounts: Account[];
	currentId?: string; colors: Palette
}) {
	const rev = getValenced()
	const { View, Text, Alert } = rev.react.ReactNative
	const { TableRowGroup, TableSwitchRow, TableRow } = rev.discord.design.Design
	const [refreshStatus, setRefreshStatus] = rev.react.React.useState(null)
	const [opening, setOpening] = rev.react.React.useState(false)
	const open = async (account: Account, kind: InboxKind) => {
		setOpening(true)
		try {
			const result = await inbox.open(account, kind)
			const detail = {
				empty: kind === 'dm' ? 'This account has no unread DMs.' : kind === 'mention'
					? 'This account has no unread server mentions.' : 'This account has no unread DMs or server mentions.',
				'switch-failed': 'Sign in to this account again, then add it to More Alts.',
				'timed-out': 'Discord is still connecting. Try again once the account has loaded.',
				unavailable: 'Discord couldn’t open the inbox item. Try opening the chat from Discord’s Inbox.',
			}
			if (result !== 'opened' && result !== 'cancelled') {
				Alert.alert(result === 'empty' ? 'You’re caught up' : 'Could not open inbox item', detail[result])
			}
		} finally {
			setOpening(false)
		}
	}
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
					Tap an account to open its newest unread DM or server mention. Counts update while the account is active.
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
			{opening && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 14 }}>Opening inbox…</Text>}
			{enabled && (ordered.length ? (
				<TableRowGroup title="Added accounts">
						{ordered.flatMap(account => {
						const summary = summaries[account.id]
						const active = account.id === currentId
						const name = account.displayName || account.username
						const detail = summary
							? `${summary.unreadDms ?? '—'} unread DM ${summary.unreadDms === 1 ? 'chat' : 'chats'} · ${summary.mentions ?? '—'} server ${summary.mentions === 1 ? 'mention' : 'mentions'}\nChecked ${new Date(summary.checkedAt).toLocaleString()}`
							: 'Waiting for the first check'
						const rows = [
							<TableRow key={account.id} label={`${name}${active ? ' · Active' : ''}`}
								subLabel={detail} subLabelLineClamp={4} icon={<Avatar user={account} border={colors.line} />}
								arrow disabled={opening} onPress={() => open(account, 'any')} />,
						]
						if ((summary?.unreadDms ?? 0) > 0) rows.push(
							<TableRow key={`${account.id}-dm`} label="Open unread DMs" accessibilityLabel={`Open unread DMs for ${name}`}
								arrow disabled={opening} onPress={() => open(account, 'dm')} />,
						)
						if ((summary?.mentions ?? 0) > 0) rows.push(
							<TableRow key={`${account.id}-mention`} label="Open server mentions" accessibilityLabel={`Open server mentions for ${name}`}
								arrow disabled={opening} onPress={() => open(account, 'mention')} />,
						)
						return rows
					})}
				</TableRowGroup>
			) : <Text style={{ color: colors.muted, fontSize: 14 }}>Add a Discord account to start seeing its inbox summary.</Text>)}
			{enabled && Object.keys(summaries).length > 0 && <TableRowGroup>
				<TableRow label="Clear saved summaries" variant="danger" onPress={() => inbox.clear().catch(() => Alert.alert('Could not clear summaries'))} />
			</TableRowGroup>}
		</>
	)
}
