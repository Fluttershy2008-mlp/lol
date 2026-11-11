import type { InboxReview } from '../lib/inboxReview'
import { usePalette } from '../ui/AccountUi'

const CHAT_VIEW = 'modules/chat/native/ChatView.tsx'

export default function patchInboxReviewBar(rev: any, review: InboxReview) {
	const { React, ReactNative: { View, Text, Pressable } } = rev.react
	const NavigationContext = rev.externals?.ReactNavigation?.ReactNavigationNative?.NavigationContext
		?? React.createContext(undefined)

	function ReviewBar({ channelId, active }: { channelId: string; active: boolean }) {
		const state = React.useSyncExternalStore(review.subscribe, review.snapshot, review.snapshot)
		const navigation = React.useContext(NavigationContext)
		const [focused, setFocused] = React.useState(() => navigation?.isFocused?.() ?? true)
		const colors = usePalette()
		const enabled = Boolean(state) && active
		React.useEffect(() => {
			if (!enabled || !navigation?.addListener) return
			const syncFocus = () => setFocused(navigation.isFocused?.() ?? true)
			syncFocus()
			const removeFocus = navigation.addListener('focus', syncFocus)
			const removeBlur = navigation.addListener('blur', syncFocus)
			return () => { removeFocus?.(); removeBlur?.() }
		}, [enabled, navigation])
		const watching = enabled && focused
		React.useEffect(() => watching ? review.watchChat(channelId) : undefined, [channelId, watching])
		if (!state || !active || !focused) return null

		const title = state.busy ? 'Opening next item…' : state.target?.kind === 'dm' ? 'Reviewing DMs' : 'Reviewing mentions'
		const detail = state.paused ? 'Paused' : state.autoAdvance ? 'Next in 8 seconds' : 'Advances when read'
		const button = (label: string, onPress: () => void, disabled = false) => (
			<Pressable accessibilityRole="button" accessibilityLabel={`${label} inbox review`}
				accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
				style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: disabled ? 0.5 : 1 }}>
				<Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
			</Pressable>
		)
		return (
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 4,
				backgroundColor: colors.panel, borderBottomColor: colors.line, borderBottomWidth: 1 }}>
				<View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
					<Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{title}</Text>
					<Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{detail}</Text>
				</View>
				{button(state.paused ? 'Resume' : 'Pause', review.togglePause)}
				{button('Next', review.next, state.busy)}
				{button('Stop', review.stop)}
			</View>
		)
	}

	let unpatch: (() => void) | undefined
	let running = true
	const finders = rev.discord?.utils?.modules?.finders
	const watch = finders?.getModuleWithImportedPath?.(CHAT_VIEW, (module: any) => {
		if (!running) return
		const memo = module?.default
		const holder = typeof memo?.type === 'function' ? memo : module
		const key = holder === memo ? 'type' : 'default'
		if (typeof holder?.[key] !== 'function') return
		unpatch = rev.patcher.instead(holder, key, function (this: unknown, args: any[], original: any) {
			const result = original.apply(this, args)
			const props = args[0]
			if (!React.isValidElement(result) || typeof props?.channelId !== 'string') return result
			const bar = React.createElement(ReviewBar, { key: 'more-alts-review', channelId: props.channelId,
				active: props.isActive !== false })
			return React.cloneElement(result, undefined, bar, result.props.children)
		})
	})
	return () => {
		running = false
		watch?.()
		unpatch?.()
	}
}
