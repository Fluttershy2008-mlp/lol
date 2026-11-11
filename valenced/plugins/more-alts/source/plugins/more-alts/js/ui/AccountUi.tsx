import type { Account } from '../lib/types'
import { getCurrentUser } from '../lib/accountActions'

export function getValenced(): any {
	return typeof valenced !== 'undefined' ? valenced : (globalThis as any).valenced
}

export function useCurrentAccount() {
	const rev = getValenced()
	const [, refresh] = rev.react.React.useReducer((version: number) => version + 1, 0)
	rev.react.React.useEffect(() => {
		const stores = rev.discord.flux?.Stores
		const observed = [stores?.UserStore, stores?.MultiAccountStore].filter(store => store?.addChangeListener && store?.removeChangeListener)
		for (const store of observed) store.addChangeListener(refresh)
		return () => { for (const store of observed) store.removeChangeListener(refresh) }
	}, [rev])
	return getCurrentUser()
}

const DARK = {
	page: '#17151a', panel: '#242127', mutedPanel: '#2d2730', selected: '#3e303c',
	line: '#443b45', text: '#f9f0f7', muted: '#c6b5c4', danger: '#ffadb7',
}
const LIGHT = {
	page: '#f8f3f7', panel: '#ffffff', mutedPanel: '#f0e8ef', selected: '#f1dce9',
	line: '#e1d3df', text: '#2d202c', muted: '#655662', danger: '#a21e34',
}
export type Palette = typeof DARK

export const HERO = {
	background: '#302131', line: '#66445d', text: '#fff6fc', muted: '#dfc7db',
	accent: '#f7c8e2', ink: '#36172c', active: '#a6e6c1',
}

let useTokenStyles: (() => Record<string, { color: string }>) | undefined

export function usePalette(): Palette {
	const rev = getValenced()
	const fallback = rev.react.ReactNative.useColorScheme?.() === 'light' ? LIGHT : DARK
	if (!useTokenStyles) {
		const tokens = rev.discord?.common?.tokens?.Tokens
		const colors = (tokens?.default ?? tokens)?.colors
		const design = rev.discord?.design?.Design
		const styles = colors && design?.createStyles?.({
			page: { color: colors.BACKGROUND_BASE_LOWER },
			panel: { color: colors.BACKGROUND_SURFACE_HIGHEST },
			mutedPanel: { color: colors.BACKGROUND_MOD_SUBTLE },
			selected: { color: colors.BACKGROUND_MOD_STRONG },
			line: { color: colors.BORDER_SUBTLE },
			text: { color: colors.TEXT_DEFAULT },
			muted: { color: colors.TEXT_MUTED },
			danger: { color: colors.TEXT_DANGER },
		})
		useTokenStyles = typeof styles === 'function' ? styles : () => styles ?? {}
	}
	const themed = useTokenStyles()
	return {
		page: themed.page?.color ?? fallback.page,
		panel: themed.panel?.color ?? fallback.panel,
		mutedPanel: themed.mutedPanel?.color ?? fallback.mutedPanel,
		selected: themed.selected?.color ?? fallback.selected,
		line: themed.line?.color ?? fallback.line,
		text: themed.text?.color ?? fallback.text,
		muted: themed.muted?.color ?? fallback.muted,
		danger: themed.danger?.color ?? fallback.danger,
	}
}

export function Glyph({ names, color, size = 18 }: { names: readonly string[]; color: string; size?: number }) {
	const rev = getValenced()
	const { Image } = rev.react.ReactNative
	for (const name of names) {
		const source = rev.assets?.getAssetIdByName?.(name)
		if (source != null) return <Image accessible={false} source={source} style={{ width: size, height: size, tintColor: color }} />
	}
	return null
}

export function Avatar({ user, size = 42, border, active = false }: {
	user?: { id?: string; avatar?: string | null }; size?: number; border: string; active?: boolean
}) {
	const { Image, View } = getValenced().react.ReactNative
	const uri = user?.id && user.avatar
		? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
		: 'https://cdn.discordapp.com/embed/avatars/0.png'
	return (
		<View style={{ width: size, height: size }}>
			<Image accessible={false} source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: border }} />
			{active && <View accessible={false} style={{ position: 'absolute', right: 0, bottom: 0, width: 15, height: 15,
				borderRadius: 8, backgroundColor: HERO.active, borderColor: HERO.background, borderWidth: 3 }} />}
		</View>
	)
}

export function AccountRow({ account, colors, showTag, detail, trailing, onPress, active = false, divider = false, actionLabel }: {
	account: Account; colors: Palette; showTag: boolean; detail?: string; trailing?: string;
	onPress?: () => void; active?: boolean; divider?: boolean; actionLabel?: string
}) {
	const { View, Text, Pressable } = getValenced().react.ReactNative
	const name = account.displayName || account.username
	const tag = showTag && account.discriminator && account.discriminator !== '0' ? `#${account.discriminator}` : ''
	const handle = `@${account.username}${tag}`
	return (
		<Pressable
			accessibilityRole={onPress ? 'button' : undefined}
			accessibilityLabel={[name, handle, account.isBot ? 'Bot' : '', trailing, onPress && actionLabel].filter(Boolean).join(', ')}
			accessibilityState={active ? { selected: true } : undefined}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => ({
				flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 68,
				borderTopWidth: divider ? 1 : 0, borderColor: colors.line,
				backgroundColor: active || pressed ? colors.mutedPanel : colors.panel,
			})}
		>
			<Avatar user={account} border={colors.line} />
			<View style={{ flex: 1, minWidth: 0, gap: 3 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
					<Text numberOfLines={2} style={{ flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>{name}</Text>
					{account.isBot && <Text style={{ backgroundColor: colors.selected, color: colors.text, borderRadius: 5,
						paddingHorizontal: 5, paddingVertical: 2, fontSize: 11, fontWeight: '700' }}>BOT</Text>}
				</View>
				<Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13 }}>{detail ? `${handle} · ${detail}` : handle}</Text>
			</View>
			{trailing && <Text style={{ color: colors.text, backgroundColor: colors.selected, borderRadius: 12,
				paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontWeight: '600' }}>{trailing}</Text>}
			{onPress && <Glyph names={actionLabel === 'Account actions' ? ['MoreHorizontalIcon', 'ic_more_24px'] : ['ChevronSmallRightIcon', 'ChevronRightIcon']} color={colors.muted} />}
		</Pressable>
	)
}
