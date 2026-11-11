@file:JvmName("MoreAltsPlugin")

package rosie.morealts

import android.app.Notification
import android.app.NotificationManager
import android.util.AtomicFile
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

private const val PREFIX = "dev.fluttershy2008.more-alts."

val moreAltsPlugin = plugin {
    var hook1: XC_MethodHook.Unhook? = null
    var hook2: XC_MethodHook.Unhook? = null

    start {
        val vaultFile = AtomicFile(File(storageDir, "accounts_vault.json"))
        val activeUserId = AtomicReference<String?>()
        val blockBackground = AtomicBoolean(true)

        registerNativeMethod(PREFIX + "saveAccounts") { args ->
            val json = args.getOrNull(0) as? String ?: return@registerNativeMethod false
            synchronized(vaultFile) {
                val output = try { vaultFile.startWrite() } catch (_: Exception) { return@registerNativeMethod false }
                try {
                    output.write(json.toByteArray(Charsets.UTF_8))
                    vaultFile.finishWrite(output)
                    true
                } catch (_: Exception) {
                    vaultFile.failWrite(output)
                    false
                }
            }
        }

        registerNativeMethod(PREFIX + "loadAccounts") {
            try {
                synchronized(vaultFile) { vaultFile.readFully().toString(Charsets.UTF_8) }
            } catch (_: Throwable) {
                "[]"
            }
        }

        registerNativeMethod(PREFIX + "setActiveUser") { args ->
            activeUserId.set(args.getOrNull(0) as? String)
            null
        }

        registerNativeMethod(PREFIX + "setBlockNotifications") { args ->
            blockBackground.set(args.getOrNull(0) as? Boolean ?: true)
            null
        }

        try {
            val hook = object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    if (!blockBackground.get()) return
                    val current = activeUserId.get() ?: return

                    val notification = param.args.firstOrNull { it is Notification } as? Notification ?: return
                    val extras = notification.extras ?: return

                    val notifUserId = extras.getString("account_id")
                        ?: extras.getString("recipient_id")
                        ?: extras.getString("discord_user_id")

                    val tag = param.args.firstOrNull { it is String } as? String

                    if (notifUserId != null && notifUserId != current) {
                        param.result = null
                        return
                    }

                    if (tag != null && tag.contains("account") && !tag.contains(current)) {
                        param.result = null
                        return
                    }
                }
            }

            hook1 = XposedHelpers.findAndHookMethod(
                NotificationManager::class.java,
                "notify",
                String::class.java,
                Int::class.javaPrimitiveType,
                Notification::class.java,
                hook
            )

            hook2 = XposedHelpers.findAndHookMethod(
                NotificationManager::class.java,
                "notify",
                Int::class.javaPrimitiveType,
                Notification::class.java,
                hook
            )
        } catch (_: Throwable) {
        }
    }

    stop {
        hook1?.unhook()
        hook2?.unhook()
        hook1 = null
        hook2 = null
    }
}
