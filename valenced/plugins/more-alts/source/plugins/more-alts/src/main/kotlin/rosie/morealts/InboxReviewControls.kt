package rosie.morealts

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToInt

internal class InboxReviewControls {
    private data class State(
        val session: String,
        val target: String,
        val title: String,
        val detail: String,
        val paused: Boolean,
        val busy: Boolean,
    )

    private data class Action(val session: String, val target: String, val name: String)

    private data class Panel(
        val view: LinearLayout, val title: TextView, val detail: TextView,
        val pause: TextView, val next: TextView,
    )

    private val state = AtomicReference<State?>()
    private val pending = AtomicReference<Action?>()
    private val main = Handler(Looper.getMainLooper())
    private var panel: Panel? = null
    private var rendered: State? = null
    private var closed = false

    fun sync(args: List<Any?>, withActivity: ((Activity) -> Unit) -> Unit): String {
        val session = args.getOrNull(0) as? String
        if (session == null) {
            clear()
            return ""
        }

        val next = State(
            session = session,
            target = args.getOrNull(1) as? String ?: "",
            title = args.getOrNull(2) as? String ?: "Inbox review",
            detail = args.getOrNull(3) as? String ?: "",
            paused = args.getOrNull(4) == true,
            busy = args.getOrNull(5) == true,
        )
        state.set(next)
        withActivity { activity -> activity.runOnUiThread { render(activity) } }
        val action = pending.getAndSet(null) ?: return ""
        if (action.session != next.session || (action.name == "next" && action.target != next.target)) return ""
        return action.name
    }

    private fun clear() {
        state.set(null)
        pending.set(null)
        main.post { if (state.get() == null) removeBar() }
    }

    fun close() {
        clear()
        main.post {
            closed = true
            removeBar()
        }
    }

    private fun removeBar() {
        val view = panel?.view ?: return
        (view.parent as? FrameLayout)?.removeView(view)
        panel = null
        rendered = null
    }

    private fun render(activity: Activity) {
        val current = state.get() ?: return
        if (closed || activity.isFinishing || activity.isDestroyed) return
        val decor = activity.window?.decorView as? FrameLayout ?: return
        if (panel?.view?.parent !== decor) removeBar()
        val currentPanel = panel ?: createPanel(activity, decor).also { panel = it }
        if (rendered == current) return
        rendered = current

        currentPanel.title.text = current.title
        currentPanel.detail.text = current.detail
        val pauseLabel = if (current.paused) "Resume" else "Pause"
        currentPanel.pause.text = pauseLabel
        currentPanel.pause.contentDescription = "$pauseLabel inbox review"
        currentPanel.next.isEnabled = !current.busy
        currentPanel.next.alpha = if (current.busy) .45f else 1f
    }

    private fun createPanel(activity: Activity, decor: FrameLayout): Panel {
        fun dp(value: Int) = (value * decor.resources.displayMetrics.density).roundToInt()
        val view = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(2), dp(4), dp(2))
            background = GradientDrawable().apply {
                setColor(Color.rgb(36, 31, 42))
                setStroke(dp(1), Color.rgb(103, 85, 115))
                cornerRadius = dp(14).toFloat()
            }
            elevation = dp(24).toFloat()
        }

        fun position(insets: WindowInsets?) {
            val safeTop: Int
            val safeLeft: Int
            val safeRight: Int
            if (Build.VERSION.SDK_INT >= 30 && insets != null) {
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                safeTop = safe.top
                safeLeft = safe.left
                safeRight = safe.right
            } else {
                @Suppress("DEPRECATION")
                safeTop = insets?.systemWindowInsetTop ?: 0
                @Suppress("DEPRECATION")
                safeLeft = insets?.systemWindowInsetLeft ?: 0
                @Suppress("DEPRECATION")
                safeRight = insets?.systemWindowInsetRight ?: 0
            }
            val width = decor.width.takeIf { it > 0 } ?: decor.resources.displayMetrics.widthPixels
            val available = (width - safeLeft - safeRight - dp(16)).coerceAtLeast(1)
            val layout = FrameLayout.LayoutParams(minOf(dp(348), available), FrameLayout.LayoutParams.WRAP_CONTENT)
            layout.gravity = Gravity.TOP or Gravity.RIGHT
            layout.topMargin = safeTop + dp(58)
            layout.rightMargin = safeRight + dp(8)
            val previous = view.layoutParams as? FrameLayout.LayoutParams
            if (previous?.width != layout.width || previous.topMargin != layout.topMargin ||
                previous.rightMargin != layout.rightMargin) view.layoutParams = layout
        }

        fun statusText(size: Float, color: Int) = TextView(activity).apply {
            textSize = size
            setTextColor(color)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }

        val title = statusText(13f, Color.WHITE)
        val detail = statusText(11f, Color.rgb(220, 204, 226))
        val status = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(title)
            addView(detail)
        }
        view.addView(status, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        fun button(label: String, action: String) = TextView(activity).apply {
            text = label
            contentDescription = "$label inbox review"
            textSize = 13f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            minHeight = dp(48)
            minWidth = dp(48)
            setPadding(dp(6), 0, dp(6), 0)
            isFocusable = true
            setOnClickListener {
                val shown = rendered ?: return@setOnClickListener
                val input = Action(shown.session, shown.target, action)
                pending.getAndUpdate { queued ->
                    if (queued?.name == "stop" && queued.session == input.session) queued else input
                }
            }
            accessibilityDelegate = object : View.AccessibilityDelegate() {
                override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
                    super.onInitializeAccessibilityNodeInfo(host, info)
                    info.className = android.widget.Button::class.java.name
                }
            }
        }.also { view.addView(it) }

        val pause = button("Pause", "pause")
        val next = button("Next", "next")
        button("Stop", "stop")
        position(decor.rootWindowInsets)
        decor.addView(view)
        view.setOnApplyWindowInsetsListener { _, insets ->
            position(insets)
            insets
        }
        view.requestApplyInsets()
        view.bringToFront()
        return Panel(view, title, detail, pause, next)
    }
}
