import { openUserProfileSheet } from '../lib/modules'

export interface FriendsRowsProps {
	guildId: string
	friends: Array<{
		userId: string
		displayName: string
		avatarHash: string | undefined
		nick: string | undefined
	}>
}

const VISIBLE_LIMIT = 5

export function FriendsRows({ guildId, friends }: FriendsRowsProps) {
	const { React } = revenge.react
	const { View, Image } = revenge.react.ReactNative
	const { TableRow, TableRowGroup, Text } = revenge.discord.design.Design as any

	const [expanded, setExpanded] = React.useState(false)

	const visibleFriends = expanded ? friends : friends.slice(0, VISIBLE_LIMIT)
	const hasMore = friends.length > VISIBLE_LIMIT

	return (
		<TableRowGroup title="Friends in Server">
			{friends.length === 0 ? (
				<TableRow label="No friends in this server" disabled />
			) : (
				<>
					{visibleFriends.map(({ userId, displayName, avatarHash, nick }) => {
						const avatarUri = avatarHash
							? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}?size=128`
							: undefined

						return (
							<TableRow
								key={userId}
								label={nick ? `${nick} (${displayName})` : displayName}
								trailing={
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 8,
										}}
									>
										{avatarUri != null && (
											<Image
												source={{ uri: avatarUri }}
												style={{ width: 28, height: 28, borderRadius: 14 }}
											/>
										)}
									</View>
								}
								onPress={() => {
									openUserProfileSheet({
										userId,
										guildId,
										ignoreBlockedSpeedBump: false,
									})
								}}
							/>
						)
					})}
					{hasMore && (
						<TableRow
							label={
								expanded
									? `Show less (${friends.length})`
									: `Show all ${friends.length} friends`
							}
							color="text-default"
							onPress={() => setExpanded(!expanded)}
						/>
					)}
				</>
			)}
		</TableRowGroup>
	)
}
