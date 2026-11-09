/* SPDX-License-Identifier: GPL-3.0-or-later */
import app.valenced.plugins.*;
import com.facebook.drawee.controller.AbstractDraweeController;
import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;
import de.robv.android.xposed.XposedBridge;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
public class MetadataCacheSmoke {
 public static class Request {private android.net.Uri source;Request(String value){set(value);}void set(String value){source=android.net.Uri.parse(value);}}
 static void check(boolean value,String why){if(!value)throw new AssertionError(why);}
 static Map<?,?> cache(String name)throws Exception{Field field=AlwaysAnimateNative.class.getDeclaredField(name);field.setAccessible(true);return (Map<?,?>)field.get(null);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/metadata-storage");dir.mkdirs();
  PluginScope scope=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return MetadataCacheSmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(scope);
  Request request=new Request("https://cdn.discordapp.com/avatars/1/static.webp");
  AbstractDraweeController controller=new AbstractDraweeController(request);
  XposedBridge.invoke(controller,"onAttach");
  Object metadata=cache("requestFields").get(Request.class);check(metadata!=null,"request class metadata cached");
  for(int i=0;i<100;i++) {
   request.set("https://cdn.discordapp.com/avatars/"+i+"/a_changed.webp");
   XposedBridge.invoke(controller,"onAttach");
   check(request.source.toString().endsWith(".gif"),"reused controller reads fresh source values");
   check(cache("requestFields").get(Request.class)==metadata,"field descriptors reused across rebinds");
  }
  request.set("https://cdn.discordapp.com/avatars/1/static.png");
  XposedBridge.invoke(controller,"onAttach");controller.onNewResultInternal();XposedBridge.invoke(controller,"getAnimatable");
  check(controller.animation.starts==0,"recycling to a static avatar drops animated tracking");
  plugin.onStop.invoke(scope);
  check(cache("requestFields").isEmpty() && cache("controllerGetters").isEmpty(),"metadata released on unload");
  plugin.onStart.invoke(scope);XposedBridge.invoke(controller,"onAttach");plugin.onStop.invoke(scope);
  System.out.println("PASS: native metadata reused across 100 controller rebinds without caching request values; animated-to-static recycling, unload and re-enable.");
 }
}
