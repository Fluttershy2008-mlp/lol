import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import {
	Animated,
	BackHandler,
	Easing,
	Pressable,
	ScrollView,
	StatusBar,
	StyleSheet,
	useWindowDimensions,
	View,
} from 'react-native'
import { EditIcon, MoreIcon, tint } from './icons'
import { openManage } from './manage'
import { inOrder, storage, useLive, isActive, useActive } from './store'
import type { Bar, Entry } from './store'

const edge = 12
const wide = 292
const hiderSettingsId = 'dev.fluttershy2008.hide-blocked-and-ignored-messages'
const gap = 8
const hold = 350
const fillDelay = 100
const out = Easing.bezier(0.23, 1, 0.32, 1)
const Moving = Animated.createAnimatedComponent(View)

let haptics: any

export const setHaptics = (v: any) => {
	haptics = v
}

let made: any

const useStyles = () => {
	if (!made) {
		const t = (Tokens as any).default ?? Tokens
		made = (Design as any).createStyles({
			shade: {
				...StyleSheet.absoluteFillObject,
				backgroundColor: 'rgba(0, 0, 0, 0.24)',
			},
			sheet: {
				position: 'absolute',
				overflow: 'hidden',
				backgroundColor: t.colors.BACKGROUND_SURFACE_HIGHEST,
				borderWidth: 1,
				borderColor: t.colors.BORDER_SUBTLE,
				borderRadius: 16,
				paddingVertical: 4,
				...t.shadows.SHADOW_HIGH,
			},
			row: {
				minHeight: 46,
				paddingHorizontal: 14,
				paddingVertical: 8,
				flexDirection: 'row',
				alignItems: 'center',
				gap: 10,
			},
			pressed: { backgroundColor: t.colors.BACKGROUND_MOD_NORMAL },
			fill: {
				...StyleSheet.absoluteFillObject,
				backgroundColor: t.colors.BACKGROUND_MOD_NORMAL,
				transformOrigin: 'left',
			},
			label: { flex: 1, minWidth: 0 },
			header: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6 },
			shortcut: { marginHorizontal: 6, paddingHorizontal: 8, borderRadius: 10,
				backgroundColor: t.colors.BACKGROUND_MOD_SUBTLE },
			more: { width: 16, height: 16, tintColor: t.colors.ICON_MUTED },
			line: { height: 1, marginHorizontal: 12, marginVertical: 4, backgroundColor: t.colors.BORDER_SUBTLE },
			track: {
				width: 30,
				height: 18,
				borderRadius: 9,
				justifyContent: 'center',
				backgroundColor: t.colors.BACKGROUND_MOD_STRONG,
			},
			trackOn: {
				backgroundColor: t.colors.SWITCH_BACKGROUND_SELECTED_DEFAULT,
			},
			thumb: {
				width: 14,
				height: 14,
				borderRadius: 7,
				backgroundColor: t.colors.SWITCH_THUMB_BACKGROUND_DEFAULT,
			},
			thumbOn: {
				backgroundColor: t.colors.SWITCH_THUMB_BACKGROUND_SELECTED_DEFAULT,
			},
		})
	}
	return made()
}

const run = (v: Animated.Value, toValue: number, ms: number, delay = 0) =>
	Animated.timing(v, {
		toValue,
		duration: ms,
		delay,
		easing: out,
		useNativeDriver: true,
	})

function Toggle({ on }: { on: boolean }) {
	const s = useStyles()
	const [v] = useState(() => new Animated.Value(on ? 1 : 0))

	useEffect(() => {
		run(v, on ? 1 : 0, 160).start()
	}, [on])

	const x = v.interpolate({ inputRange: [0, 1], outputRange: [2, 14] })
	return (
		<View style={[s.track, on && s.trackOn]}>
			<Moving
				style={[s.thumb, on && s.thumbOn, { transform: [{ translateX: x }] }]}
			/>
		</View>
	)
}

interface RowProps {
	label: string
	Icon?: Entry['Icon']
	on?: boolean
	press: () => void
	held?: () => void
	shortcut?: boolean
}

function Row({ label, Icon, on, press, held, shortcut }: RowProps) {
	const s = useStyles()
	const [v] = useState(() => new Animated.Value(0))
	const [down, setDown] = useState(false)
	const Tinted = Icon && tint(Icon)
	const toggle = typeof on === 'boolean'

	return (
		<Pressable
			style={[s.row, shortcut && s.shortcut, down && s.pressed]}
			accessibilityLabel={label}
			accessibilityHint={shortcut ? 'Opens filter settings' : undefined}
			accessibilityRole={toggle ? 'switch' : 'button'}
			accessibilityState={toggle ? { checked: on } : undefined}
			accessibilityActions={
				held ? [{ name: 'longpress', label: 'Hold' }] : undefined
			}
			onAccessibilityAction={() => held?.()}
			delayLongPress={hold}
			onPress={press}
			onLongPress={
				held
					? () => {
							haptics?.triggerHapticFeedback(
								haptics.HapticFeedbackTypes.IMPACT_LIGHT,
							)
							held()
						}
					: undefined
			}
			onPressIn={() => {
				setDown(true)
				if (!held) return
				v.setValue(0)
				Animated.timing(v, {
					toValue: 1,
					delay: fillDelay,
					duration: hold - fillDelay,
					easing: Easing.linear,
					useNativeDriver: true,
				}).start()
			}}
			onPressOut={() => {
				setDown(false)
				if (held) run(v, 0, 140).start()
			}}
		>
			{held && (
				<Moving
					pointerEvents="none"
					style={[s.fill, { transform: [{ scaleX: v }] }]}
				/>
			)}
			{Tinted && <Tinted />}
			<View style={s.label}>
				<Design.Text variant="text-md/medium" color="text-strong" numberOfLines={2}>
					{label}
				</Design.Text>
				{shortcut && <Design.Text variant="text-sm/normal" color="text-muted">Filter settings</Design.Text>}
			</View>
			{shortcut && <Design.Text variant="text-xl/medium" color="text-muted">›</Design.Text>}
			{held && <MoreIcon style={s.more} />}
			{toggle && <Toggle on={on} />}
		</Pressable>
	)
}

export function Sheet({ menu, transitionState, cleanUp }: any) {
	const active = useActive()
	const s = useStyles()
	const bar: Bar = menu.items[0].bar
	const opts = storage.use()
	const entries = inOrder(useLive(bar), opts).filter(x => !opts?.kept?.[x.id])
	const shortcut = entries.find(x => x.id === hiderSettingsId)
	const rows = entries.filter(x => x !== shortcut)
	const { width, height } = useWindowDimensions()
	const [v] = useState(() => new Animated.Value(0))
	const yeeted = transitionState === (Design as any).TransitionStates.YEETED
	const done = useRef({ cleanUp, onClose: menu.onClose })
	done.current = { cleanUp, onClose: menu.onClose }

	const close = () => menu.requestClose(true)
	const find = (id: string) => bar.list().find(x => x.id === id)

	useEffect(() => {
		if (!yeeted) return void run(v, 1, 170).start()
		run(v, 0, 110).start(() => {
			done.current.cleanUp()
			done.current.onClose?.()
		})
	}, [yeeted])

	useEffect(() => {
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			close()
			return true
		})
		return () => sub.remove()
	}, [])
	useEffect(() => { if (!active) close() }, [active])

	const horizontal = Math.max(edge, Math.min(menu.x, width - 172 - edge))
	const top = (StatusBar.currentHeight ?? 44) + edge
	const place = {
		[menu.positionX]: horizontal,
		bottom: menu.y + gap,
		width: Math.min(wide, width - edge - horizontal),
		maxHeight: Math.max(0, height - menu.y - gap - top),
		transformOrigin: `${menu.positionX} bottom`,
	}
	const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })

	return !active ? null : (
		<>
			<Pressable
				style={StyleSheet.absoluteFill}
				accessibilityLabel="Close"
				onPress={close}
			>
				<Moving style={[s.shade, { opacity: v }]} />
			</Pressable>
			<Moving
				accessibilityRole="menu"
				style={[s.sheet, place, { opacity: v, transform: [{ scale }] }]}
			>
				<ScrollView bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
					<View style={s.header}>
						<Design.Text variant="text-sm/semibold" color="text-muted" accessibilityRole="header">Chat tools</Design.Text>
					</View>
					{shortcut && <Row
						label={opts?.names?.[shortcut.id] || shortcut.label}
						Icon={shortcut.Icon}
						shortcut
						press={() => {
							if (!isActive()) return
							close()
							find(shortcut.id)?.press()
						}}
					/>}
					{rows.map(x => (
						<Row
							key={x.id}
							label={opts?.names?.[x.id] || x.label}
							Icon={x.Icon}
							on={x.on}
							press={() => {
								if (!isActive()) return
								if (typeof x.on !== 'boolean') close()
								find(x.id)?.press()
							}}
							held={
								x.hold &&
								(() => {
									if (!isActive()) return
									close()
									find(x.id)?.hold?.()
								})
							}
						/>
					))}
					{(shortcut || !!rows.length) && <View style={s.line} />}
					<Row
						label="Manage buttons"
						Icon={EditIcon}
						press={() => {
							close()
							openManage(bar)
						}}
					/>
				</ScrollView>
			</Moving>
		</>
	)
}
