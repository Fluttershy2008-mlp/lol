package app.valenced.plugins;
public interface PluginScope {
 java.io.File getStorageDir(); ClassLoader getClassLoader(); boolean getStartedLate(); void requireReload();
}
