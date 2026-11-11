import * as React from 'react'

declare const valenced: any

const ALIASES: Record<string, string[]> = {
	SparklesIcon: ['MagicWandIcon'],
	SparkleIcon: ['MagicWandIcon'],
}

export function rowIcon(...requested: string[]) {
	return findIcon(requested, false)
}

export function dangerIcon(...requested: string[]) {
	return findIcon(requested, true)
}

function safe<T>(read: () => T): T | undefined {
	try {
		return read()
	} catch {
		return undefined
	}
}

function getValenced() {
	return typeof valenced !== 'undefined' ? valenced : (globalThis as any).valenced
}

function findIcon(requested: string[], danger: boolean) {
	const names = [
		...new Set(requested.flatMap(name => [name, ...(ALIASES[name] ?? [])])),
	]
	const v = getValenced()
	const design = v?.discord?.design?.Design
	const Icon = design?.TableRow?.Icon ?? design?.TableRowIcon
	const getAssetIdByName = v?.assets?.getAssetIdByName
	const lookupComponent = safe(() => v?.utils?.discord?.lookupGeneratedIconComponent)

	for (const name of names) {
		const source = safe(() => (getAssetIdByName ? getAssetIdByName(name) || undefined : undefined))
		const Component = safe(() => lookupComponent?.(name))
		if (danger) {
			if (Icon && (Component || source))
				return (
					<Icon source={source} IconComponent={Component} variant="danger" />
				)
			continue
		}
		if (source && Icon) return <Icon source={source} />
		if (Component) return <Component />
	}

	return undefined
}
