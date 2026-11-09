import { useSyncExternalStore } from 'react'
import type { ComponentType, RefObject } from 'react'

export interface Options {
	names: Record<string, string>
	kept: Record<string, boolean>
	seen: Record<string, string>
}

export interface Entry {
	id: string
	label: string
	Icon?: ComponentType<any>
	on?: boolean
	press: () => void
	hold?: () => void
}

export interface Bar {
	add(ref: RefObject<Entry>): () => void
	touch(entry: Entry): void
	list(): Entry[]
	subscribe(sub: () => void): () => void
	version(): number
}

export const defaults: Options = { names: {}, kept: {}, seen: {} }

export let storage: any

export const setStorage = (v: any) => {
	storage = v
}

let active = false
const activity = new Set<() => void>()
export const isActive = () => active
export function setActive(value: boolean) {
	active = value
	for (const notify of activity) notify()
}
const subscribeActivity = (notify: () => void) => {
	activity.add(notify)
	return () => { activity.delete(notify) }
}
export const useActive = () => useSyncExternalStore(subscribeActivity, isActive, isActive)

const icons = new Map<string, ComponentType<any>>()

export const iconFor = (id: string) => icons.get(id)

function note({ id, label, Icon }: Entry) {
	if (Icon) icons.set(id, Icon)
	if (active && storage?.cache?.seen?.[id] !== label)
		storage?.set({ seen: { [id]: label } })
}

export function createBar(): Bar {
	const refs = new Set<RefObject<Entry>>()
	const subs = new Set<() => void>()
	let version = 0

	const bump = () => {
		version++
		for (const sub of subs) sub()
	}

	return {
		add(ref) {
			refs.add(ref)
			note(ref.current)
			bump()
			return () => {
				refs.delete(ref)
				bump()
			}
		},
		touch(entry) {
			note(entry)
			bump()
		},
		list: () => [...refs].map(x => x.current),
		subscribe(sub) {
			subs.add(sub)
			return () => {
				subs.delete(sub)
			}
		},
		version: () => version,
	}
}

const never = () => () => {}
const zero = () => 0

export function useLive(bar?: Bar | null) {
	useSyncExternalStore(bar?.subscribe ?? never, bar?.version ?? zero)
	return bar?.list() ?? []
}

export function inOrder(list: Entry[], s: any) {
	const order = Object.keys(s?.seen ?? {})
	const at = (x: Entry) => {
		const i = order.indexOf(x.id)
		return i === -1 ? order.length : i
	}
	return [...list].sort((a, b) => at(a) - at(b))
}
