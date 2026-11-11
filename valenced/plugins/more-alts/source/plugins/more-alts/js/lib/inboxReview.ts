import type { Account } from './types'
import {
	attempt, collectInboxReviewTargets, isInboxTargetRead, navigateToInboxTarget,
	type InboxOpenResult, type InboxTarget,
} from './inboxNavigation'

const ADVANCE_DELAY_MS = 8000

export type InboxAccountTask = (
	isReady: () => boolean, signal: AbortSignal,
) => Promise<InboxOpenResult>

type Snapshot = {
	paused: boolean
	busy: boolean
	autoAdvance: boolean
	target?: InboxTarget
}

export interface InboxReview {
	start: (accounts: Account[]) => void
	next: () => void
	togglePause: () => void
	stop: () => void
	subscribe: (listener: () => void) => () => void
	snapshot: () => Snapshot | undefined
	watchChat: (channelId: string) => () => void
	sync: () => void
	dispose: () => void
}

type Run = {
	accounts: Account[]
	queue?: InboxTarget[]
	account?: Account
	target?: InboxTarget
	controller: AbortController
	paused: boolean
	busy: boolean
	opened: boolean
}

export function createInboxReview(
	rev: any, stores: any, currentId: () => string | undefined,
	accountIsReady: (id: string) => boolean,
	withAccount: (account: Account, task: InboxAccountTask, signal: AbortSignal) => Promise<InboxOpenResult>,
): InboxReview {
	const { AppState, Keyboard, ToastAndroid } = rev.react.ReactNative
	const listeners = new Set<() => void>()
	const chats = new Map<symbol, string>()
	let foreground = AppState?.currentState == null || AppState.currentState === 'active'
	let keyboardOpen = Keyboard?.isVisible?.() === true
	let disposed = false
	let run: Run | undefined
	let state: Snapshot | undefined
	let timer: ReturnType<typeof setTimeout> | undefined

	const subscriptions = [
		AppState?.addEventListener?.('change', (state: string) => { foreground = state === 'active'; sync() }),
		Keyboard?.addListener?.('keyboardDidShow', () => { keyboardOpen = true; sync() }),
		Keyboard?.addListener?.('keyboardDidHide', () => { keyboardOpen = false; sync() }),
	]

	function publish() {
		const next = run && {
			paused: run.paused, busy: run.busy, target: run.target, autoAdvance: timer !== undefined,
		}
		if (state?.paused === next?.paused && state?.busy === next?.busy &&
			state?.target === next?.target && state?.autoAdvance === next?.autoAdvance) return
		state = next
		for (const listener of listeners) listener()
	}

	function clearTimer() {
		if (timer !== undefined) clearTimeout(timer)
		timer = undefined
	}

	function stop() {
		clearTimer()
		run?.controller.abort()
		run = undefined
		publish()
	}

	function finish(message: string) {
		stop()
		ToastAndroid?.show?.(message, ToastAndroid.SHORT)
	}

	function canAdvance() {
		const current = run
		if (!current?.target || !current.account || current.busy || current.paused || !foreground ||
			keyboardOpen || Keyboard?.isVisible?.() === true || !accountIsReady(current.account.id)) return false
		const channelId = current.target.channelId
		const selected = attempt(() => stores.SelectedChannelStore?.getCurrentlySelectedChannelId?.())
			?? attempt(() => stores.SelectedChannelStore?.getChannelId?.())
		return (selected == null || selected === channelId) && [...chats.values()].includes(channelId)
			&& attempt(() => isInboxTargetRead(stores, current.target!)) === true
	}

	function sync() {
		if (run?.target && run.account && !run.busy && currentId() && run.account.id !== currentId()) {
			stop()
			return
		}
		if (!canAdvance()) clearTimer()
		else if (timer === undefined) timer = setTimeout(() => {
			timer = undefined
			if (canAdvance()) void advance()
			else publish()
		}, ADVANCE_DELAY_MS)
		publish()
	}

	async function advance() {
		const current = run
		if (!current || current.busy || !foreground) return
		clearTimer()
		current.busy = true
		publish()
		try {
			while (run === current) {
				current.account ??= current.accounts.shift()
				const account = current.account
				if (!account) {
					finish(current.opened ? 'Inbox review complete.' : 'No unread inbox items to review.')
					return
				}
				const result = await withAccount(account, async (isReady, signal) => {
					const canOpen = () => foreground && isReady()
					if (!canOpen()) return 'cancelled'
					current.queue ??= await collectInboxReviewTargets(rev, stores, canOpen, signal)
					if (!canOpen()) return 'cancelled'
					const target = current.queue.shift()
					if (!target) return 'empty'
					const opened = navigateToInboxTarget(rev, target)
					if (opened === 'opened') current.target = target
					return opened
				}, current.controller.signal)
				if (run !== current) return
				if (result === 'opened') {
					current.opened = true
					return
				}
				if (result === 'empty') {
					current.account = undefined
					current.queue = undefined
					continue
				}
				if (result === 'cancelled') stop()
				else finish('Inbox review stopped because Discord couldn’t open the next item.')
				return
			}
		} catch {
			if (run === current) finish('Inbox review stopped because Discord couldn’t open the next item.')
		} finally {
			if (run === current) {
				current.busy = false
				sync()
			}
		}
	}

	return {
		start(accounts) {
			if (disposed || run || !accounts.length) return
			run = { accounts: [...accounts], controller: new AbortController(), paused: false, busy: false, opened: false }
			void advance()
		},
		next: () => { void advance() },
		togglePause() {
			if (!run) return
			run.paused = !run.paused
			sync()
		},
		stop,
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		snapshot: () => state,
		watchChat(channelId) {
			const key = Symbol()
			chats.set(key, channelId)
			sync()
			return () => { chats.delete(key); sync() }
		},
		sync,
		dispose() {
			disposed = true
			stop()
			for (const subscription of subscriptions) subscription?.remove?.()
			chats.clear()
			listeners.clear()
		},
	}
}
