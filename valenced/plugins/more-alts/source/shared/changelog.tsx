import { rowIcon } from './ui/icon'
import { useBottomPadding } from './ui/safeArea'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import * as components from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as modulesSettings from '@valenced/discord/modules/settings'
import * as react from '@valenced/react'
import * as ReactNative from 'react-native'
import { reportError } from './report'

declare const valenced: any
declare const revenge: any

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	try {
		if (typeof revenge !== 'undefined') return revenge
	} catch {}
	return (globalThis as any).valenced ?? (globalThis as any).revenge
}

export interface ChangelogEntry {
	version: string
	date?: string
	title?: string
	changes: string[]
}

interface Registered {
	id: string
	name: string
	current: string
	entries: ChangelogEntry[]
	storage: any
	latestOnly?: boolean
	pending?: ChangelogEntry[]
}

interface ChangelogOptions {
	latestOnly?: boolean
}

let registered: Registered | undefined

const SEEN_KEY = 'changelogSeenVersion'
const DIALOG_VERSIONS = 3

export const changelogRoute = (id: string) => `${id}.changelog`

function versionString(version: any): string {
	if (typeof version === 'string') return version
	if (version && Array.isArray(version.nums)) {
		return version.nums.join('.') + (version.label ? `-${version.label}` : '')
	}
	return String(version ?? '')
}

function parse(version: string): { nums: number[]; pre: string | undefined } {
	const [main, pre] = String(version).split('-', 2)
	return { nums: main.split('.').map(n => Number.parseInt(n, 10) || 0), pre }
}

export function compareVersions(a: string, b: string): number {
	const x = parse(a)
	const y = parse(b)
	for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
		if (d) return d
	}
	if (x.pre === y.pre) return 0
	if (x.pre === undefined) return 1
	if (y.pre === undefined) return -1
	return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

export function setupChangelog(api: any, entries: ChangelogEntry[], options: ChangelogOptions = {}): () => void {
	const manifest = api?.plugin?.manifest ?? {}
	const plugin: Registered = {
		id: manifest.id,
		name: manifest.name ?? manifest.id,
		current: versionString(manifest.version),
		entries: [...entries].sort((a, b) => compareVersions(b.version, a.version)),
		storage: api?.jsonStorage,
		latestOnly: options.latestOnly,
	}
	registered = plugin

	const unregisterPage = registerPage(plugin)
	checkForUpdate(plugin).catch(error => reportError(`[${plugin.name}] changelog check failed:`, error))

	return () => {
		if (registered === plugin) registered = undefined
		unregisterPage()
	}
}

async function checkForUpdate(plugin: Registered) {
	if (!plugin.storage) return
	const data = await plugin.storage.get()
	const seen: string | undefined = data?.[SEEN_KEY] ? versionString(data[SEEN_KEY]) : undefined
	if (seen === plugin.current) return
	if (!seen || compareVersions(plugin.current, seen) < 0) {
		await plugin.storage.set({ [SEEN_KEY]: plugin.current })
		return
	}
	const fresh = plugin.entries.filter(
		e => compareVersions(e.version, seen) > 0 && compareVersions(e.version, plugin.current) <= 0,
	)
	if (fresh.length) {
		plugin.pending = plugin.latestOnly ? fresh.slice(0, 1) : fresh
		showWhatsNew(plugin, plugin.pending, () => {
			try {
				const rev = getValenced()
				const nav =
					rev?.discord?.modules?.mainTabsV2?.RootNavigationRef?.getRootNavigationRef?.() ??
					(globalThis as any)?.valenced?.discord?.modules?.mainTabsV2?.RootNavigationRef?.getRootNavigationRef?.()
				nav?.navigate?.(changelogRoute(plugin.id))
			} catch {}
		})
		await plugin.storage.set({ [SEEN_KEY]: plugin.current })
	} else {
		await plugin.storage.set({ [SEEN_KEY]: plugin.current })
	}
}

export function useChangelog(options: { header?: boolean } = {}) {
	const rev = getValenced()
	const React = rev?.react?.React ?? (globalThis as any).React ?? react.React
	const navigation = ReactNavigationNative?.useNavigation?.() as {
		navigate: (route: string) => void
		setOptions?: (options: Record<string, unknown>) => void
	} | undefined
	const header = options.header !== false

	if (React?.useLayoutEffect) {
		React.useLayoutEffect(() => {
			if (header && registered && navigation?.setOptions) navigation.setOptions({ headerRight: () => <ChangelogButton /> })
		}, [header])
	}

	if (React?.useEffect) {
		React.useEffect(() => {
			const plugin = registered
			if (!plugin?.pending?.length) return
			const entries = plugin.pending
			plugin.pending = undefined
			if (navigation?.navigate) {
				showWhatsNew(plugin, entries, () => navigation.navigate(changelogRoute(plugin.id)))
			}
			plugin.storage
				?.set({ [SEEN_KEY]: plugin.current })
				.catch((error: unknown) => reportError(`[${plugin.name}] could not save the seen version:`, error))
		}, [])
	}
}

export function ChangelogButton() {
	const rev = getValenced()
	const rn = rev?.react?.ReactNative ?? (globalThis as any).ReactNative ?? ReactNative
	const Pressable = rn.Pressable ?? 'Pressable'
	const navigation = ReactNavigationNative?.useNavigation?.() as { navigate: (route: string) => void } | undefined
	const plugin = registered
	if (!plugin) return null
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Changelog"
			hitSlop={12}
			onPress={() => navigation?.navigate?.(changelogRoute(plugin.id))}
			style={({ pressed }: { pressed: boolean }) => ({ paddingHorizontal: 12, opacity: pressed ? 0.5 : 1 })}
		>
			{rowIcon('ClockIcon', 'ic_clock')}
		</Pressable>
	)
}

function Bullets({ changes }: { changes: string[] }) {
	const rev = getValenced()
	const rn = rev?.react?.ReactNative ?? (globalThis as any).ReactNative ?? ReactNative
	const View = rn.View ?? 'View'
	const design = rev?.discord?.design?.Design ?? Design ?? {}
	const Text = design.Text ?? 'Text'
	return (
		<View style={{ gap: 4 }}>
			{changes.map((change, i) => (
				<View key={i} style={{ flexDirection: 'row' }}>
					<Text variant="text-sm/normal" color="text-muted" style={{ width: 14 }}>
						•
					</Text>
					<Text variant="text-sm/normal" color="text-muted" style={{ flex: 1 }}>
						{change}
					</Text>
				</View>
			))}
		</View>
	)
}

function versionHeading(entry: ChangelogEntry): string {
	return entry.title ? `${entry.version} · ${entry.title}` : entry.version
}

function showWhatsNew(plugin: Registered, entries: ChangelogEntry[], openChangelog: () => void) {
	const rev = getValenced()
	const rn = rev?.react?.ReactNative ?? (globalThis as any).ReactNative ?? ReactNative
	const ScrollView = rn.ScrollView ?? 'ScrollView'
	const View = rn.View ?? 'View'
	const Dimensions = rn.Dimensions ?? { get: () => ({ height: 800 }) }
	const design = rev?.discord?.design?.Design ?? Design ?? {}
	const { AlertModal = View, AlertActionButton = View, Text = 'Text' } = design
	const alerts = (rev?.discord?.actions?.AlertActionCreators ?? AlertActionCreators) as any
	if (!alerts?.openAlert) return
	const key = `rosie-whats-new-${plugin.id}`
	const close = () => alerts.dismissAlert(key)
	const shown = entries.slice(0, DIALOG_VERSIONS)
	const more = entries.length - shown.length

	const content = (
		<ScrollView
			style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.5) }}
			nestedScrollEnabled
		>
			<View style={{ gap: 12 }}>
				{shown.map(entry => (
					<View key={entry.version} style={{ gap: 4 }}>
						<Text variant="text-sm/semibold" color="text-default">
							{versionHeading(entry)}
						</Text>
						<Bullets changes={entry.changes} />
					</View>
				))}
				{more > 0 ? (
					<Text variant="text-sm/normal" color="text-muted">
						And {more} more version{more === 1 ? '' : 's'} in the full changelog.
					</Text>
				) : null}
			</View>
		</ScrollView>
	)

	try {
		alerts.openAlert(
			key,
			<AlertModal
				title={`What's new in ${plugin.name} ${plugin.current}`}
				extraContent={content}
				actions={
					<>
						<AlertActionButton
							text="Full changelog"
							variant="primary"
							onPress={() => {
								close()
								openChangelog()
							}}
						/>
						<AlertActionButton text="Close" variant="secondary" onPress={close} />
					</>
				}
			/>,
		)
	} catch (error) {
		reportError(`[${plugin.name}] couldn't show what's new:`, error)
	}
}

function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

function registerPage(plugin: Registered): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings
	const route = changelogRoute(plugin.id)
	let unregister: (() => void) | undefined

	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => 'Changelog',
			screen: { route, getComponent: () => ChangelogPage },
		} as any)
		refreshSettingsUI()
	})
	return () => {
		unsubscribe()
		unregister?.()
		unregister = undefined
		refreshSettingsUI()
	}
}

function ChangelogPage() {
	const rev = getValenced()
	const rn = rev?.react?.ReactNative ?? (globalThis as any).ReactNative ?? ReactNative
	const ScrollView = rn.ScrollView ?? 'ScrollView'
	const View = rn.View ?? 'View'
	const design = rev?.discord?.design?.Design ?? Design ?? {}
	const { Stack = View, Text = 'Text', TableRowGroup = View, TableRow = View } = design
	const Page = (components as any).Page ?? View
	const bottom = useBottomPadding()
	const plugin = registered
	if (!plugin) return null

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Every version of {plugin.name}, newest first. You have {plugin.current}.
					</Text>
					{plugin.entries.map(entry => {
						const tag = entry.version === plugin.current ? ' · installed' : ''
						return (
							<TableRowGroup
								key={entry.version}
								title={`${entry.version}${tag}${entry.date ? ` · ${entry.date}` : ''}`}
							>
								<TableRow
									label={entry.title ?? `Version ${entry.version}`}
									subLabel={
										<View style={{ marginTop: 6 }}>
											<Bullets changes={entry.changes} />
										</View>
									}
								/>
							</TableRowGroup>
						)
					})}
				</Stack>
			</ScrollView>
		</Page>
	)
}