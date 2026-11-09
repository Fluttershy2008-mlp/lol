import app.valenced.plugins.*;
import com.facebook.drawee.controller.*;
import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;
import de.robv.android.xposed.XposedBridge;
import java.io.*;
public class NativeSmoke {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/test-storage");dir.mkdirs();
  write(dir,"{\"images\":true}");
  PluginScope scope=new PluginScope(){
   public File getStorageDir(){return dir;}
   public ClassLoader getClassLoader(){return NativeSmoke.class.getClassLoader();}
   public boolean getStartedLate(){return false;}
   public void requireReload(){}
  };
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(scope);
  check(XposedBridge.hooks.size()==4,"native hooks attached without builder, including chat bind and image setter");
  for(String uri:new String[]{"https://cdn.discordapp.com/avatars/1/a_abc.gif?size=128","https://cdn.discordapp.com/guilds/1/users/2/avatars/a_def.webp"}){
   AbstractDraweeControllerBuilder builder=new AbstractDraweeControllerBuilder(uri);
   AbstractDraweeController c=builder.build();
   XposedBridge.invoke(c,"onAttach");
   check(builder.request.getSourceUri().contains(".gif"),"URI rewritten at attachment");
   c.onNewResultInternal();XposedBridge.invoke(c,"getAnimatable");check(c.animation.starts==1,"asynchronous image load starts playback");
   c.animation.stop();XposedBridge.invoke(c,"onAttach");check(c.animation.starts==2,"reattach resumes playback");
  }
  for(String uri:new String[]{"https://cdn.discordapp.com/avatars/1/static.png","https://cdn.discordapp.com/icons/1/a_abc.gif","https://cdn.discordapp.com/attachments/1/2/a_abc.gif","https://example.com/avatars/1/a_abc.gif"}){
   AbstractDraweeControllerBuilder builder=new AbstractDraweeControllerBuilder(uri);
   AbstractDraweeController c=builder.build();
   XposedBridge.invoke(c,"onAttach");c.onNewResultInternal();XposedBridge.invoke(c,"getAnimatable");
   check(c.animation.starts==0,"non-avatar untouched: "+uri);
  }
  write(dir,"{\"images\":false}");
  java.lang.reflect.Field checked=AlwaysAnimateNative.class.getDeclaredField("checked");checked.setAccessible(true);checked.setLong(null,0);
  AbstractDraweeControllerBuilder disabled=new AbstractDraweeControllerBuilder("https://cdn.discordapp.com/avatars/1/a_abc.gif");
  AbstractDraweeController dc=disabled.build();
  XposedBridge.invoke(dc,"onAttach");dc.onNewResultInternal();XposedBridge.invoke(dc,"getAnimatable");check(dc.animation.starts==0,"settings disable autoplay");
  plugin.onStop.invoke(scope);check(XposedBridge.hooks.isEmpty(),"disable removes native hooks");
  System.out.println("PASS: native hook lifecycle, animated-only avatar scoping, asynchronous playback, reattachment, static/server/attachment preservation and settings.");
 }
 static void write(File dir,String json)throws Exception{FileOutputStream out=new FileOutputStream(new File(dir,"storage.json"));try{out.write(json.getBytes("UTF-8"));}finally{out.close();}}
}
