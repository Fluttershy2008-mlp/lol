@file:JvmName("MoreAltsPlugin")

package rosie.morealts

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.AtomicFile
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import org.json.JSONArray
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

private const val PREFIX = "dev.fluttershy2008.more-alts."
private const val FCM_RECEIVE = "com.google.android.c2dm.intent.RECEIVE"
private const val FCM_DIRECT_BOOT = "com.google.firebase.messaging.RECEIVE_DIRECT_BOOT"
private const val PUSH_ACCOUNT = "receiving_user_id"

private val visiblePushTypes = setOf(
    "MESSAGE_CREATE",
    "FORUM_THREAD_CREATED",
    "RELATIONSHIP_ADD",
    "FRIEND_SUGGESTION_CREATE",
    "CALL_RING",
    "CALL_CONNECT",
    "ACTIVITY_START",
    "APPLICATION_LIBRARY_INSTALL_COMPLETE",
    "STAGE_INSTANCE_CREATE",
    "GUILD_SCHEDULED_EVENT_UPDATE",
    "GUILD_STREAM_START",
    "GENERIC_PUSH_NOTIFICATION_SENT",
)

private class OtherAccountPush(private val preferences: SharedPreferences) {
    @Synchronized
    fun configure(accountIds: Set<String>) {
        val pending = preferences.getStringSet("pending", emptySet()).orEmpty().intersect(accountIds)
        preferences.edit().putStringSet("accounts", accountIds).putStringSet("pending", pending).apply()
    }

    @Synchronized
    fun record(accountId: String) {
        if (accountId !in preferences.getStringSet("accounts", emptySet()).orEmpty()) return
        val pending = preferences.getStringSet("pending", emptySet()).orEmpty()
        if (accountId !in pending) preferences.edit().putStringSet("pending", pending + accountId).apply()
    }

    @Synchronized
    fun hasPending(): Boolean = !preferences.getStringSet("pending", emptySet()).isNullOrEmpty()
}

@Suppress("DEPRECATION")
private fun hookIncomingPush(
    context: Context,
    loader: ClassLoader,
    state: OtherAccountPush,
): XC_MethodHook.Unhook? {
    val intent = Intent(FCM_RECEIVE).setPackage(context.packageName)
    val receivers = context.packageManager.queryBroadcastReceivers(intent, 0)
        .filter { it.activityInfo.permission == "com.google.android.c2dm.permission.SEND" }
        .map { it.activityInfo.name }
    val manager = context.getSystemService(NotificationManager::class.java)
    for (name in (listOf("com.google.firebase.iid.FirebaseInstanceIdReceiver") + receivers).distinct()) {
        val receiver = runCatching { Class.forName(name, false, loader) }.getOrNull() ?: continue
        val owner = generateSequence(receiver) { it.superclass }.firstOrNull { type ->
            runCatching { type.getDeclaredMethod("onReceive", Context::class.java, Intent::class.java) }.isSuccess
        } ?: continue
        val hook = runCatching {
            XposedHelpers.findAndHookMethod(owner, "onReceive", Context::class.java, Intent::class.java,
                object : XC_MethodHook() {
                    override fun beforeHookedMethod(param: MethodHookParam) {
                        if (!receiver.isInstance(param.thisObject)) return
                        val incoming = param.args.getOrNull(1) as? Intent ?: return
                        if (incoming.action != FCM_RECEIVE && incoming.action != FCM_DIRECT_BOOT) return
                        if (incoming.getStringExtra("type") !in visiblePushTypes) return
                        val accountId = incoming.getStringExtra(PUSH_ACCOUNT) ?: return
                        if (manager?.areNotificationsEnabled() == true) state.record(accountId)
                    }
                })
        }.getOrNull()
        if (hook != null) return hook
    }
    return null
}

val moreAltsPlugin = plugin {
    var hook1: XC_MethodHook.Unhook? = null
    var hook2: XC_MethodHook.Unhook? = null
    var pushHook: XC_MethodHook.Unhook? = null
    var running = false
    var reviewControls: InboxReviewControls? = null

    start {
        running = true
        val controls = InboxReviewControls()
        reviewControls = controls
        registerNativeMethod(PREFIX + "syncInboxReviewControls") { args ->
            controls.sync(args, ::withAppActivity)
        }
        val push = AtomicReference<OtherAccountPush?>()
        withAppContext { context ->
            if (running) {
                val state = OtherAccountPush(context.getSharedPreferences(PREFIX + "push", Context.MODE_PRIVATE))
                push.set(state)
                pushHook = runCatching { hookIncomingPush(context, classLoader, state) }.getOrNull()
            }
        }

        registerNativeMethod(PREFIX + "configureOtherAccountPush") { args ->
            val ids = runCatching { JSONArray(args.getOrNull(0) as? String ?: "[]") }.getOrNull()
                ?: return@registerNativeMethod false
            val state = push.get() ?: return@registerNativeMethod false
            state.configure((0 until ids.length()).mapNotNull { ids.opt(it) as? String }.toSet())
            true
        }

        registerNativeMethod(PREFIX + "hasOtherAccountPush") {
            push.get()?.hasPending() == true
        }

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

                    val notifUserId = extras.getString(PUSH_ACCOUNT)
                        ?: extras.getString("account_id")
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
        running = false
        reviewControls?.close()
        reviewControls = null
        pushHook?.unhook()
        pushHook = null
        hook1?.unhook()
        hook2?.unhook()
        hook1 = null
        hook2 = null
    }
}
