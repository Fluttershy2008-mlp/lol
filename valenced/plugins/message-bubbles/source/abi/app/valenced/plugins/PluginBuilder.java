package app.valenced.plugins;

import kotlin.Unit;
import kotlin.jvm.functions.Function1;

public final class PluginBuilder {
    public void start(Function1<PluginScope, Unit> block) {}
    public void stop(Function1<PluginScope, Unit> block) {}
}
