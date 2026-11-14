import { ToastActionCreators } from "@valenced/discord/actions"
import { Stores, withStoreName } from "@valenced/discord/flux"
import { lookupModule } from "@valenced/modules/finders"
import { withDependencies, withName } from "@valenced/modules/finders/filters"
import { before } from "@valenced/patcher"
import { ReactJSXRuntime } from "@valenced/react"
import { lookupGeneratedIconComponent } from "@valenced/utils/discord"

// thanks datamine wumpus
type MarkGuildsAsRead = (
	guildIds: string[],
	context?: string,
	onFinished?: () => void
) => void

// blame @valenced/types
interface GuildStore {
	getGuildIds(): string[]
}

interface GuildReadStateStore {
	getGuildHasUnreadIgnoreMuted(guildId: string): boolean
}

export default plugin({
	init({ cleanup, plugin: self }) {
		if (self.startedLate) self.requireReload()
		let markGuildsAsRead: MarkGuildsAsRead | undefined

		// pain but okay
		const getMarkGuildsAsRead = () => {
			if (markGuildsAsRead) return markGuildsAsRead

			const anchorIds = [
				"ChannelStore",
				"GuildChannelStore",
				"ReadStateStore"
			].map(name => lookupModule(withStoreName(name))[1])
			if (anchorIds.includes(undefined)) return

			const { atLeast, unordered } = withDependencies
			const [exports, id] = lookupModule(
				withName<MarkGuildsAsRead>("markGuildsAsRead").and(
					withDependencies(atLeast(3, unordered(anchorIds as number[])))
				)
			)
			if (id !== undefined) markGuildsAsRead = exports

			return markGuildsAsRead
		}

		const onMessagesLongPress = () => {
			const { GuildStore, GuildReadStateStore } = Stores as unknown as {
				GuildStore: GuildStore
				GuildReadStateStore: GuildReadStateStore
			}

			const unreadGuildIds = GuildStore.getGuildIds().filter(id =>
				GuildReadStateStore.getGuildHasUnreadIgnoreMuted(id)
			)
			if (!unreadGuildIds.length) return

			const markAsRead = getMarkGuildsAsRead()
			if (!markAsRead) return

			// why undefined? it just for client-sided analytics context
			markAsRead(unreadGuildIds, undefined, () => {
				ToastActionCreators.open("read-all-done", {
					text: `Read ${unreadGuildIds.length} servers!`,
					// why: its in init patch, this icon might dont exist when loads
					icon: lookupGeneratedIconComponent("ChatCheckIcon")
				})
			})
		}

		const nameOf = (type: unknown) =>
			typeof type === "function" ? type.name : undefined

		const patchJSX = (args: [type: any, props: any, key?: any]) => {
			const [type, props, key] = args
			if (
				nameOf(type) !== "GuildsBarAnimatedItemWrapper" ||
				nameOf(props?.expandedChildren?.type) !== "HomeDrawerDMsRowWrapper"
			)
				return args

			return [
				type,
				{
					...props,
					config: { ...props.config, onLongPress: onMessagesLongPress }
				},
				key
			] as typeof args
		}

		cleanup(
			before(ReactJSXRuntime, "jsx", patchJSX),
			before(ReactJSXRuntime, "jsxs", patchJSX)
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	}
})
