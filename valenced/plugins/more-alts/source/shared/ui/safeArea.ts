import * as ReactNativeSafeAreaContext from '@valenced/externals/react-native-safe-area-context'


export function useBottomPadding(base = 16): number {
	try {
		const mod = ReactNativeSafeAreaContext as any
		const insets = mod?.useSafeAreaInsets?.()
		if (typeof insets?.bottom === 'number') return insets.bottom + base
	} catch {

	}
	return base
}
