package app.valenced.xposed.api

import android.app.Activity
import android.content.Context
import android.content.pm.ApplicationInfo
import app.valenced.bridge.ValencedBridge

interface HostScope {
    val modulePath: String
    val appInfo: ApplicationInfo
    val classLoader: ClassLoader
    val bridge: ValencedBridge
    fun withAppContext(block: (Context) -> Unit)
    fun withAppActivity(block: (Activity) -> Unit)
}

fun HostScope.registerNativeMethod(
    name: String,
    handler: (args: List<Any?>) -> Any?,
) = bridge.registerMethod(name, handler)

fun HostScope.registerNativeAsyncMethod(
    name: String,
    handler: suspend (args: List<Any?>) -> Any?,
) = bridge.registerAsyncMethod(name, handler)

suspend fun HostScope.callJSMethod(name: String, args: List<Any?> = emptyList()): Any? =
    bridge.callJSMethod(name, args)
