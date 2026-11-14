import { Design } from '@valenced/discord/design'
import {
	Children,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useLayoutEffect,
	useEffect,
	useRef,
	useState,
} from 'react'
import { View } from 'react-native'
import { EmojiIcon, MenuIcon } from './icons'
import { createBar, storage, isActive, useActive } from './store'
import type { ComponentType, ReactNode } from 'react'
import type { Bar as BarType, Entry } from './store'

const Bar = createContext<BarType | null>(null)
const Free = createContext(false)
const Slot = createContext<((v: boolean) => void) | null>(null)

function useHeld(entry: Entry) {
	const bar = useContext(Bar)
	const slot = useContext(Slot)
	const s = storage.use()
	const kept = !bar || !!s?.kept?.[entry.id]
	const ref = useRef(entry)
	ref.current = entry

	useLayoutEffect(() => bar?.add(ref), [bar, entry.id])
	useLayoutEffect(
		() => bar?.touch(ref.current),
		[bar, entry.id, entry.label, entry.on, entry.Icon, !!entry.hold],
	)
	useLayoutEffect(() => {
		slot?.(!kept)
	}, [kept, slot])

	return kept
}

const hiddenStyle = { position: 'absolute', right: 56, opacity: 0 } as const

function Stash({ hidden, children }: { hidden: boolean; children: ReactNode }) {
	return (
		<View
			collapsable={false}
			pointerEvents={hidden ? 'none' : 'auto'}
			style={hidden ? hiddenStyle : undefined}
			accessibilityElementsHidden={hidden}
			importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
		>
			{children}
		</View>
	)
}

const stateOf = (p: any) =>
	p.accessibilityState?.checked ?? p.accessibilityState?.selected ?? p.active

const touch = { nativeEvent: {}, persist() {} }

const replay = (p: any, fire: (e: any) => void) => () => {
	if (!isActive() || typeof fire !== 'function') return
	p.onPressIn?.(touch)
	try { fire(touch) } finally { p.onPressOut?.(touch) }
}

const replayGesture = (h: any) => () => {
	if (!isActive()) return
	h.onBegin?.(touch)
	h.onStart?.(touch)
	h.onEnd?.(touch, true)
	h.onFinalize?.(touch, true)
}

const longGesture = (g: any): any => {
	if (!g) return
	if (g.handlerName === 'LongPressGestureHandler')
		return g.handlers?.onStart || g.handlers?.onBegin
			? replayGesture(g.handlers)
			: undefined
	for (const x of g.gestures ?? []) {
		const hit = longGesture(x)
		if (hit) return hit
	}
}

const findHold = (node: any): any => {
	if (Array.isArray(node)) {
		for (const x of node) {
			const hit = findHold(x)
			if (hit) return hit
		}
		return
	}
	if (!isValidElement(node)) return
	const p = node.props as any
	if (typeof p.onLongPress === 'function') return replay(p, p.onLongPress)
	return longGesture(p.gesture) ?? findHold(p.children)
}

export const forced = { on: false }

let Button: any

export const setButton = (v: any) => {
	Button = v
}

export function Hold({ real: Real, ...props }: any) {
	const active = useActive()
	const bar = useContext(Bar)
	const free = useContext(Free)
	return !active || !bar || free ? (
		<Plain real={Real} {...props} />
	) : (
		<Held real={Real} {...props} />
	)
}

const run = (Real: any, props: any) => {
	const out = Real(props)
	return props.onLongPress && isValidElement(out)
		? cloneElement(out as any, { onLongPress: props.onLongPress })
		: out
}

function Plain({ real, ...props }: any) {
	return run(real, props)
}

function Held({ real: Real, ...props }: any) {
	const gift = !!useContext(Slot)
	const out = run(Real, props)
	const kept = useHeld({
		id: props.chatButtonsId ?? props.accessibilityLabel ?? props.IconComponent?.name ?? 'button',
		label: props.chatButtonsLabel ?? props.accessibilityLabel ?? 'Button',
		Icon: props.IconComponent,
		on: gift ? undefined : stateOf(props),
		press: replay(props, props.onPress),
		hold: findHold(out),
	})
	return <Stash hidden={!kept}>{out}</Stash>
}

export const markOwn = (node: any): any => {
	if (Array.isArray(node)) {
		for (const [i, x] of node.entries()) {
			const hit = markOwn(x)
			if (hit !== x) {
				const next = [...node]
				next[i] = hit
				return next
			}
		}
		return node
	}
	if (!isValidElement(node)) return node
	const p = node.props as any
	if (node.type === Popup) return { ...node, props: { ...p, [mine]: true } }
	const children = markOwn(p.children)
	return children === p.children ? node : { ...node, props: { ...p, children } }
}

const mine = Symbol('own')

let Real: any

export const setMenu = (v: any) => {
	Real = v
}

export function Popup({ [mine]: own, ...props }: any) {
	const active = useActive()
	const bar = useContext(Bar)
	const free = useContext(Free)
	const p = bar && !free && !own ? props.children?.({})?.props : null
	const button = p?.accessibilityLabel || p?.IconComponent
	if (!active || !button || p.keep || p.accessibilityActions)
		return createElement(Real, props)
	return <Caught props={props} p={p} />
}

function Caught({ props, p }: any) {
	const handle = useRef<any>(null)
	const timer = useRef<any>(null)
	useEffect(() => () => clearTimeout(timer.current), [])
	const [open] = useState(() => () => {
		clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			if (!isActive()) return
			forced.on = true
			try { handle.current?.onPress?.() } finally { forced.on = false }
		}, 160)
	})
	const long = !!props.triggerOnLongPress
	const kept = useHeld({
		id: p.chatButtonsId ?? p.accessibilityLabel ?? p.IconComponent?.name ?? 'menu',
		label: p.chatButtonsLabel ?? p.accessibilityLabel ?? 'Menu',
		Icon: p.IconComponent,
		on: stateOf(p),
		press: long && p.onPress ? p.onPress : open,
		hold: long ? open : undefined,
	})
	return (
		<Free.Provider value>
			<Stash hidden={!kept}>
				{createElement(Real, {
					...props,
					children: (x: any) => {
						handle.current = x
						return props.children(x)
					},
				})}
			</Stash>
		</Free.Provider>
	)
}

export const skips = (p: any) =>
	p.keep || !p.onPress || !!p.accessibilityActions

function Emoji({ el }: { el: any }) {
	const kept = useHeld({
		id: 'emoji',
		label: 'Emoji',
		Icon: EmojiIcon,
		press: el.props.onPress,
	})
	return <Stash hidden={!kept}>{el}</Stash>
}

function Gift({ children }: { children: ReactNode }) {
	const [gone, setGone] = useState(false)
	return (
		<Slot.Provider value={setGone}>
			<Stash hidden={gone}>{children}</Stash>
		</Slot.Provider>
	)
}

const pressable = (node: any): any => {
	if (Array.isArray(node)) {
		for (const x of node) {
			const hit = pressable(x)
			if (hit) return hit
		}
		return
	}
	if (!isValidElement(node)) return
	const p = node.props as any
	return typeof p.onPress === 'function' ? p : pressable(p.children)
}

const longPress = (node: any): boolean => {
	if (Array.isArray(node)) return node.some(longPress)
	if (!isValidElement(node) || node.type === Popup) return false
	const p = node.props as any
	return !!p.triggerOnLongPress || longPress(p.children)
}

const hasButton = (node: any): boolean => {
	if (Array.isArray(node)) return node.some(hasButton)
	if (!isValidElement(node)) return false
	return node.type === Button || hasButton((node.props as any).children)
}

const inner = (type: any) => {
	if (typeof type === 'function')
		return type.prototype?.isReactComponent ? undefined : type
	if (type?.type) return inner(type.type)
	return type?.render
}

const leaf = (node: any): any => {
	if (Array.isArray(node)) {
		for (const x of node) {
			const hit = leaf(x)
			if (hit) return hit
		}
		return
	}
	if (!isValidElement(node)) return
	return leaf((node.props as any).children) ?? node
}

function Foreign({ render, id, props }: any) {
	const out = render(props, props.ref)
	if (longPress(out)) return <Free.Provider value>{out}</Free.Provider>
	const hit = pressable(out)
	if (!hit || (hasButton(out) && !findHold(out))) return out
	return <Picked id={id} out={out} hit={hit} />
}

function Picked({ id, out, hit }: any) {
	const name = hit.chatButtonsLabel ?? hit.accessibilityLabel ?? id
	const icon = useRef(hit.children)
	icon.current = hit.children
	const [Drawn] = useState(() => ({ style }: any) => {
		const x = leaf(icon.current)
		return x
			? cloneElement(x as any, { style: [(x.props as any).style, style] })
			: null
	})
	const kept = useHeld({
		id: hit.chatButtonsId ?? name,
		label: name,
		Icon: hit.IconComponent ?? Drawn,
		on: stateOf(hit),
		press: replay(hit, hit.onPress),
		hold: findHold(out),
	})
	return (
		<Free.Provider value>
			<Stash hidden={!kept}>{out}</Stash>
		</Free.Provider>
	)
}

const wrapped = new WeakMap<object, ComponentType<any>>()

function wrap(el: any) {
	const render = inner(el.type)
	if (!render) return el

	let Comp = wrapped.get(el.type)
	if (!Comp) {
		Comp = ({ id, props }: any) => (
			<Foreign render={render} id={id} props={props} />
		)
		wrapped.set(el.type, Comp)
	}

	const name = el.type.displayName ?? render.displayName ?? render.name
	const id = name?.length > 2 ? name : (el.key ?? 'Button')
	return createElement(Comp, { key: el.key, id, props: el.props })
}

function swap(el: any, As: any) {
	if (!isValidElement(el)) return el
	const p = el.props as any
	if (el.type === As) return el
	if ('onSendMessage' in p)
		return (
			<Free.Provider key="send" value>
				{el}
			</Free.Provider>
		)
	if ('renderItem' in p) return <Gift key="gift">{el}</Gift>
	if ('showKeyboardIcon' in p) return <Emoji key="emoji" el={el} />
	return wrap(el)
}

const hasExpr = (x: any) =>
	isValidElement(x) && !!(x.props as any).onPressExpression

const isRight = (x: any) => {
	if (!isValidElement(x)) return false
	const c = (x.props as any).children
	if (hasExpr(c)) return true
	if (!isValidElement(c)) return false
	const kids = (c.props as any).children
	return Array.isArray(kids) ? kids.some(hasExpr) : hasExpr(kids)
}

function Menu({ bar }: { bar: BarType }) {
	const { ContextMenu } = Design as any
	const [items] = useState(() => [{ label: 'Buttons', bar }])

	return (
		<ContextMenu align="above" triggerOnTap items={items}>
			{(p: any) => (
				<Button
					{...p}
					keep
					accessibilityLabel="Buttons"
					IconComponent={MenuIcon}
				/>
			)}
		</ContextMenu>
	)
}

export function Row({ as: As, menu, children, ...props }: any) {
	const active = useActive()
	const [bar] = useState(createBar)
	if (!active || (menu && (!Button || !(Design as any).ContextMenu)))
		return <As {...props}>{children}</As>
	const list = Children.toArray(children)
	const out = list.map(x => swap(x, As))
	if (!menu) return <As {...props}>{out}</As>

	out.splice(Math.max(0, list.findIndex(isRight)), 0, <Menu key="menu" bar={bar} />)
	return (
		<Bar.Provider value={bar}>
			<As {...props}>{out}</As>
		</Bar.Provider>
	)
}

export function swapRow(node: ReactNode): ReactNode {
	if (!isValidElement(node)) return node

	const { children } = node.props as any
	const list = Array.isArray(children) ? children : [children]

	if (list.some(isRight))
		return {
			...node,
			type: Row,
			props: { ...(node.props as any), as: node.type, menu: true },
		} as any

	for (const [i, child] of list.entries()) {
		const patched = swapRow(child)
		if (patched === child) continue

		const next = [...list]
		next[i] = patched
		return {
			...node,
			props: {
				...(node.props as any),
				children: Array.isArray(children) ? next : patched,
			},
		}
	}

	return node
}
