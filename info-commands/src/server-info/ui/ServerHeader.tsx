import { runtime } from "../runtime"
export interface ServerHeaderProps {
	name: string
	description: string | null | undefined
	iconUri: string | undefined
	onOpenIcon?: () => void
}

export function ServerHeader({
	name,
	description,
	iconUri,
	onOpenIcon,
}: ServerHeaderProps) {
	const { View, Image, TouchableOpacity } = runtime.react.ReactNative
	const { Text } = runtime.discord.design.Design as any

	const image = iconUri != null ? (
		<Image source={{ uri: iconUri }} style={{ width: 56, height: 56, borderRadius: 14 }} />
	) : null

	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 12,
				paddingTop: 16,
				paddingBottom: 8,
			}}
		>
			{image && onOpenIcon ? (
				<TouchableOpacity accessibilityRole="button" accessibilityLabel="View server icon" onPress={onOpenIcon}>
					{image}
				</TouchableOpacity>
			) : image}
			<View style={{ flex: 1 }}>
				<Text variant="text-lg/semibold" color="text-default" lineClamp={1}>
					{name}
				</Text>
				{description != null && description.length > 0 && (
					<Text variant="text-sm/normal" color="text-subtle" lineClamp={2}>
						{description}
					</Text>
				)}
			</View>
		</View>
	)
}
