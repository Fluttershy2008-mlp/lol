import app.valenced.plugins.*;
import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;
import de.robv.android.xposed.XposedBridge;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;
import org.luckypray.dexkit.query.FindMethod;
import java.io.*;
import java.lang.reflect.Method;
public class RenamedSmoke {
 static void check(boolean value,String text){if(!value)throw new AssertionError(text);}
 public static class Finder {
  public Method findMethod(Function1<Object,Unit> config)throws Exception {
   FindMethod query=new FindMethod();config.invoke(query);
   String marker=query.value.marker;
   if(marker.equals("Hierarchy cannot be null on attach"))return renamed.a.class.getMethod("y");
   if(marker.startsWith("Cannot specify"))throw new AssertionError("Builder lookup must not be needed");
   if(marker.equals("drawable_failed @ onNewResult"))return renamed.a.class.getMethod("w");
   return null;
  }
 }
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/renamed-storage");dir.mkdirs();
  FileOutputStream out=new FileOutputStream(new File(dir,"storage.json"));out.write("{\"images\":true}".getBytes("UTF-8"));out.close();
  PluginScope scope=new PluginScope(){
   public File getStorageDir(){return dir;}
   public ClassLoader getClassLoader(){return new ClassLoader(RenamedSmoke.class.getClassLoader()){
    protected Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException {
     if(name.startsWith("com.facebook.drawee.controller."))throw new ClassNotFoundException(name);
     return super.loadClass(name,resolve);
    }
   };}
   public Object getDexFinder(){return new Finder();}
   public boolean getStartedLate(){return false;}public void requireReload(){}
  };
  PluginBuilder p=AlwaysAnimateNative.getPlugin();p.onStart.invoke(scope);
  check(XposedBridge.hooks.size()==4,"builder and original Fresco class names unavailable; controller and chat hooks still attach");
  renamed.b b=new renamed.b("https://cdn.discordapp.com/avatars/1/a_abc.webp?size=128&format=webp");
  renamed.a c=b.z();
  XposedBridge.invoke(c,"y");
  java.lang.reflect.Field uri=c.request.getClass().getDeclaredField("k");uri.setAccessible(true);
  check(uri.get(c.request).toString().equals("https://cdn.discordapp.com/avatars/1/a_abc.gif?size=128"),"renamed final URI field changed to GIF before loading");
  c.w();XposedBridge.invoke(c,"x");check(c.z.starts==1,"renamed animation getter starts playback");
  c.z.stop();XposedBridge.invoke(c,"y");check(c.z.starts==2,"renamed attach restarts native animation");
  renamed.a staticAvatar=new renamed.b("https://cdn.discordapp.com/avatars/1/static.webp").z();
  XposedBridge.invoke(staticAvatar,"y");staticAvatar.w();XposedBridge.invoke(staticAvatar,"x");check(staticAvatar.z.starts==0,"static avatar preserved");
  // Fresco may reuse a controller for another row. Clear the mapping even
  // when the next request is static, so it does not inherit autoplay.
  int stopsBefore=c.z.stops;p.onStop.invoke(scope);check(c.z.stops==stopsBefore+1,"tracked animation stopped on disable");
  check(XposedBridge.hooks.isEmpty(),"renamed hooks removed");
  System.out.println("PASS: controller-builder-not-found regression: no builder lookup; renamed controller, getter and request fields; playback and cleanup.");
 }
}
