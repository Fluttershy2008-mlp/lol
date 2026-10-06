import { OverviewRows } from './OverviewRows'
import { ServerBanner } from './ServerBanner'
import { ServerHeader } from './ServerHeader'
import { ServerRows } from './ServerRows'
import { FriendsRows } from './FriendsRows'
import { useGuildInfo } from './useGuildInfo'

export interface ServerInfoSheetProps {
	guildId: string
}

// Lookup BottomSheetScrollView so the ActionSheet integrates with native gestures.
let scrollContainerModule: any
function getScrollContainer(): any {
	if (scrollContainerModule) return scrollContainerModule
	try {
		const [exports] = revenge.modules.finders.lookupModule(
			revenge.modules.finders.filters.withProps('BottomSheetScrollView'),
		)
		if (exports?.BottomSheetScrollView) {
			scrollContainerModule = exports.BottomSheetScrollView
		}
	} catch {}
	return scrollContainerModule
}

export default function ServerInfoSheet({ guildId }: ServerInfoSheetProps) {
	const RN = revenge.react.ReactNative as any
	const { View, ActivityIndicator, ScrollView } = RN
	const Animated = RN.Animated
	const React = revenge.react.React
	const Design = revenge.discord.design.Design as any
	const { ActionSheet, Text } = Design
	const sideInset = Design?.space?.PX_16 ?? 16
	const extraBleed = 12
	const bleed = sideInset + extraBleed
	const BANNER_HEIGHT = 140
	const bannerSpacing = Design?.space?.PX_12 ?? 12
	const ScrollContainer = getScrollContainer() ?? ScrollView

	const { guild, isLoading, ...info } = useGuildInfo(guildId)
	const [containerWidth, setContainerWidth] = React.useState<number | undefined>(undefined)
	const scrollY = React.useRef(Animated ? new Animated.Value(0) : { current: 0 }).current

	if (!guild && !isLoading) return null
	if (!guild && isLoading) {
		return (
			<ActionSheet scrollable startExpanded>
				<ScrollContainer contentContainerStyle={{ flexGrow: 1 }}>
					<View
						style={{
							flex: 1,
							alignItems: 'center',
							justifyContent: 'center',
							padding: 40,
						}}
					>
						<ActivityIndicator size="large" color="#5865f2" />
						<Text
							variant="text-md/normal"
							color="text-subtle"
							style={{ marginTop: 12 }}
						>
							Loading server info…
						</Text>
					</View>
				</ScrollContainer>
			</ActionSheet>
		)
	}
	if (!guild) return null

	return (
		<ActionSheet
			scrollable
			handleDisabled
			startExpanded
			contentStyles={{ paddingHorizontal: 0, paddingBottom: 24 }}
		>
				<View style={{ width: '100%', position: 'relative', overflow: 'visible' }} onLayout={(e: any) => setContainerWidth(e.nativeEvent.layout.width)}>
					{info.bannerUri != null && (
						<ServerBanner uri={info.bannerUri} bleed={bleed} height={140} scrollY={scrollY} />
					)}
					<ScrollContainer
						contentContainerStyle={{ flexGrow: 1, paddingTop: info.bannerUri != null ? BANNER_HEIGHT + bannerSpacing : 0, paddingBottom: 24, paddingHorizontal: 0, gap: 16 }}
						nestedScrollEnabled={true}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
						onScroll={(e: any) => {
						const y = e?.nativeEvent?.contentOffset?.y ?? 0
						if (Animated && typeof scrollY?.setValue === 'function') {
							scrollY.setValue(y)
						}
					}}
						scrollEventThrottle={16}
				>
					{/* Content wrapper -- banner is absolute, content is padded down via ScrollContainer */}
					<View
						style={{
							marginHorizontal: -sideInset,
							paddingHorizontal: sideInset,
							gap: 16,
							paddingTop: 8,
						}}
					>
						<ServerHeader
							name={guild.name}
							description={guild.description}
							iconUri={info.iconUri}
						/>
						<OverviewRows {...info} />
						<ServerRows guildId={guildId} {...info} />
						<FriendsRows guildId={guildId} friends={info.friends} />
					</View>
				</ScrollContainer>
			</View>
		</ActionSheet>
	)
}
