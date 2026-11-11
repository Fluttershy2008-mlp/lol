package app.valenced.plugins

import app.valenced.Logger
import app.valenced.xposed.api.HostScope
import kotlinx.coroutines.flow.MutableSharedFlow
import java.io.File

interface PluginScope : HostScope {
    val log: Logger
    val manifest: PluginManifest
    val storageDir: File
    val enabled: Boolean
    val startedLate: Boolean
    val errors: MutableSharedFlow<Throwable>
    fun requireReload()
    fun stop()
    fun disable()
}
