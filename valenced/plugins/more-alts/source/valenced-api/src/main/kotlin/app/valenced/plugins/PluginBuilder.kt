package app.valenced.plugins

class PluginBuilder {
    private var startBlock: PluginScope.() -> Unit = {}
    private var stopBlock: PluginScope.() -> Unit = {}

    fun start(block: PluginScope.() -> Unit) {
        startBlock = block
    }

    fun stop(block: PluginScope.() -> Unit) {
        stopBlock = block
    }

    fun build(manifest: PluginManifest): Plugin {
        return object : Plugin(manifest) {
            override fun start(ctx: PluginScope) = ctx.startBlock()
            override fun stop(ctx: PluginScope) = ctx.stopBlock()
        }
    }
}

fun plugin(block: PluginBuilder.() -> Unit): PluginBuilder {
    val builder = PluginBuilder()
    builder.block()
    return builder
}
