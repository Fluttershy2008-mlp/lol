package app.valenced.plugins

abstract class Plugin(val manifest: PluginManifest) {
    abstract fun start(ctx: PluginScope)
    abstract fun stop(ctx: PluginScope)
}
