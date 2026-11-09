import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Image, View } from 'react-native'
import type { ComponentType } from 'react'

const asset =
	(name: string) =>
	({ style }: any) => (
		<Image
			source={getAssetIdByName(name)}
			style={[{ width: 24, height: 24 }, style]}
		/>
	)

export const MenuIcon = asset('GridSquareIcon')
export const EmojiIcon = asset('ReactionIcon')
export const HiddenSettingsIcon = asset('WrenchIcon')
export const EditIcon = asset('PencilIcon')
export const MoreIcon = asset('MoreHorizontalIcon')

const box = {
	width: 24,
	height: 24,
	alignItems: 'center',
	justifyContent: 'center',
} as const

const tints = new WeakMap<object, ComponentType<any>>()

export function tint(Icon: ComponentType<any>) {
	let Tinted = tints.get(Icon)
	if (!Tinted) {
		Tinted = () => {
			const t = (Tokens as any).default ?? Tokens
			const tintColor = (Design as any).useToken(
				t.colors.INTERACTIVE_ICON_DEFAULT,
			)
			return (
				<View pointerEvents="none" style={box}>
					<Icon style={{ width: 20, height: 20, tintColor }} />
				</View>
			)
		}
		tints.set(Icon, Tinted)
	}
	return Tinted
}
