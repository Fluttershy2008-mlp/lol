package app.valenced.plugins;

public interface PluginScope {
    ClassLoader getClassLoader();
    boolean getStartedLate();
    void requireReload();
}
