package app.valenced.bridge

interface ValencedBridge {
    fun registerMethod(name: String, handler: (args: List<Any?>) -> Any?)
    fun registerAsyncMethod(name: String, handler: suspend (args: List<Any?>) -> Any?)
    suspend fun callJSMethod(name: String, args: List<Any?> = emptyList()): Any?
}
