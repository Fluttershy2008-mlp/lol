import {
	ActionSheetActionCreators,
	AlertActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { tint } from './icons'
import { iconFor, inOrder, storage, useLive } from './store'
import type { Bar } from './store'

function Nickname({ id, label }: { id: string; label: string }) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const [text, setText] = useState(storage.cache?.names?.[id] ?? '')

	return (
		<AlertModal
			title="Nickname"
			content={label}
			extraContent={
				<TextInput
					autoFocus
					placeholder={label}
					value={text}
					onChange={setText}
				/>
			}
			actions={
				<>
					<AlertActionButton
						text="Save"
						variant="primary"
						onPress={() => storage.set({ names: { [id]: text.trim() } })}
					/>
					<AlertActionButton text="Cancel" variant="secondary" />
				</>
			}
		/>
	)
}

function ButtonList({ bar }: { bar?: Bar }) {
	const { FormSwitch, TableRow, TableRowGroup } = Design as any
	const s = storage.use()
	const live = inOrder(useLive(bar), s)
	if (!s) return null

	const here = new Map(live.map(x => [x.id, x]))
	const rest = Object.keys(s.seen ?? {}).filter(id => !here.has(id))
	const ids = [...here.keys(), ...rest]
	const hint = (id: string) => {
		if (bar && !here.has(id)) return 'Not in this chat'
		return s.names?.[id] ? s.seen?.[id] : 'Tap to add a nickname'
	}

	return (
		<TableRowGroup title="In the menu">
			{!ids.length && <TableRow label="Open a chat to see your buttons" />}
			{ids.map(id => {
				const label = here.get(id)?.label ?? s.seen?.[id] ?? id
				const name = s.names?.[id]
				const Icon = here.get(id)?.Icon ?? iconFor(id)
				return (
					<TableRow
						key={id}
						label={name || label}
						subLabel={hint(id)}
						icon={
							Icon ? <TableRow.Icon IconComponent={tint(Icon)} /> : undefined
						}
						trailing={
							<FormSwitch
								value={!s.kept?.[id]}
								onValueChange={(v: boolean) =>
									storage.set({ kept: { [id]: !v } })
								}
							/>
						}
						onPress={() =>
							AlertActionCreators.openAlert(
								'chatbuttons-nickname',
								createElement(Nickname, { id, label }),
							)
						}
					/>
				)
			})}
		</TableRowGroup>
	)
}

function ManageSheet({ bar }: { bar: Bar }) {
	const { ActionSheet, ActionSheetCloseButton, BottomSheetTitleHeader } =
		Design as any

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Chat buttons"
					trailing={
						<ActionSheetCloseButton
							onPress={() => ActionSheetActionCreators.hideActionSheet()}
						/>
					}
				/>
			}
		>
			<View style={{ paddingBottom: 16 }}>
				<ButtonList bar={bar} />
			</View>
		</ActionSheet>
	)
}

export const openManage = (bar: Bar) =>
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: ManageSheet }) as any,
		'ChatButtons',
		{ bar } as any,
	)

export function Settings() {
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
			<ButtonList />
		</ScrollView>
	)
}
