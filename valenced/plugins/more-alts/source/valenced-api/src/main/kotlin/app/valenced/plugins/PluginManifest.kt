package app.valenced.plugins

data class PluginManifest(
    val id: String,
    val name: String,
    val version: String,
    val description: String? = null,
    val author: String? = null,
)
