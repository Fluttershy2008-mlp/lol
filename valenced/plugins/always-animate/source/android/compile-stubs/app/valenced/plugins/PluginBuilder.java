package app.valenced.plugins;
import kotlin.Unit; import kotlin.jvm.functions.Function1;
public class PluginBuilder {
 public Function1<PluginScope,Unit> onStart, onStop;
 public void start(Function1<PluginScope,Unit> block){onStart=block;}
 public void stop(Function1<PluginScope,Unit> block){onStop=block;}
}
