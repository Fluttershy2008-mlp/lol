import type { InboxReview } from '../lib/inboxReview'
import { callNative } from './nativeSwitcher'

const POLL_MS = 250

export default function startNativeInboxReviewControls(rev: any, review: InboxReview) {
	const { AppState } = rev.react.ReactNative
	let foreground = AppState?.currentState == null || AppState.currentState === 'active'
	let active = true
	let shown = false
	let inFlight = false
	let refresh = false
	let sequence = 0
	let session: string | undefined
	let timer: ReturnType<typeof setTimeout> | undefined

	function schedule(delay = 0) {
		if (timer !== undefined) clearTimeout(timer)
		timer = setTimeout(poll, delay)
	}

	async function poll() {
		timer = undefined
		if (inFlight) {
			refresh = true
			return
		}
		inFlight = true
		if (active && foreground) review.sync()
		const snapshot = active && session ? review.snapshot() : undefined
		if ((!snapshot && !shown) || (snapshot && !foreground)) {
			inFlight = false
			return
		}
		const currentSession = session
		const target = snapshot?.target
		const targetKey = target ? `${target.channelId}:${target.messageId ?? ''}` : ''
		shown = Boolean(snapshot)
		const args = snapshot ? [
			currentSession, targetKey,
			snapshot.busy ? 'Opening next item…' : target?.kind === 'dm' ? 'Reviewing DMs' : 'Reviewing mentions',
			snapshot.paused ? 'Paused' : snapshot.autoAdvance ? 'Moving to the next item soon' : 'Advances when read',
			snapshot.paused, snapshot.busy,
		] : []
		try {
			const action = await callNative('syncInboxReviewControls', args)
			if (!active || !foreground || !snapshot || session !== currentSession) return
			if (action === 'stop') review.stop()
			else if (action === 'pause') review.togglePause()
			else if (action === 'next' && review.snapshot()?.target === target) review.next()
		} finally {
			inFlight = false
			if (refresh) {
				refresh = false
				schedule()
			} else if (active && foreground && session) schedule(POLL_MS)
		}
	}

	const unsubscribe = review.subscribe(() => {
		if (review.snapshot()) session ??= `${Date.now()}-${++sequence}`
		else session = undefined
		schedule()
	})
	const appState = AppState?.addEventListener?.('change', (state: string) => {
		foreground = state === 'active'
		schedule()
	})
	return () => {
		active = false
		session = undefined
		unsubscribe()
		appState?.remove()
		if (timer !== undefined) clearTimeout(timer)
		return poll()
	}
}
