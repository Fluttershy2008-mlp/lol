import { patchGuildsBarContextMenu } from './lib/contextMenu'
import { initKmmiioLib } from './lib/modules'

export default plugin({
	start({ cleanup, plugin }) {
		const kmmiio = plugin.api?.unscoped?.kmmiio
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		initKmmiioLib(plugin.api)
		kmmiio?.registerPlugin({
			id: plugin.manifest.id,
			name: plugin.manifest.name,
			icon: plugin.manifest.icon,
			author: plugin.manifest.author,
			description: plugin.manifest.description,
			version: plugin.manifest.version,
			getStatus: () => plugin.status,
			getErrors: () => plugin.errors,
		})
		try {
			cleanup(patchGuildsBarContextMenu())
		} catch {}

		// The guilds bar menu module is looked up at plugin start; when the plugin is
		// enabled while the app is already running that module may have already
		// initialized, so the context menu patch can be missed. Requiring a reload
		// guarantees the patch always applies from a clean start.
		if (plugin.startedLate) {
			plugin.requireReload()
		}
	},
})
