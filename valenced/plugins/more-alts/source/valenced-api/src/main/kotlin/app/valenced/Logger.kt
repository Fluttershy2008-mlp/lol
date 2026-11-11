package app.valenced

open class Logger(val namespace: String? = null) {
    open fun v(msg: String, t: Throwable? = null) {}
    open fun d(msg: String, t: Throwable? = null) {}
    open fun i(msg: String, t: Throwable? = null) {}
    open fun w(msg: String, t: Throwable? = null) {}
    open fun e(msg: String, t: Throwable? = null) {}

    companion object {
        const val TAG = "ValencedAndroid"
    }
}
