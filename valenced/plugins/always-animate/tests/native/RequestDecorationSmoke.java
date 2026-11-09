import app.valenced.plugins.*;import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;import de.robv.android.xposed.XposedBridge;import java.io.*;import java.lang.reflect.*;
import com.discord.chat.presentation.message.MessageView;import com.facebook.drawee.controller.AbstractDraweeController;import android.widget.ImageView;import android.graphics.drawable.AnimationDrawable;import android.os.Handler;
public class RequestDecorationSmoke {
 public static class Request {private final android.net.Uri uri;Request(String u){uri=android.net.Uri.parse(u);}}
 public static class Supplier {private final Object value;Supplier(String u){value=new Request(u);}}
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/bundled-storage");dir.mkdirs();
  PluginScope ctx=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return RequestDecorationSmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(ctx);
  MessageView root=new MessageView();root.frame.width=root.frame.height=0;
  // No String setter was called and the native Message has no decoration URL.
  // The loader assigned a still-image Fresco controller directly instead.
  root.frame.controller=new AbstractDraweeController(new Supplier("https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png?passthrough=false"));root.frame.controller.supportsAnimation=false;root.frame.controller.loaded=true;
  Method probe=AlwaysAnimateNative.class.getDeclaredMethod("probeMessage",Object.class,String.class);probe.setAccessible(true);probe.invoke(null,root,"request-test");
  check(root.frameParent.overlay.views.isEmpty(),"zero-size view must not start an invisible PNG player");
  root.frame.relayout(10,20,144,144);check(root.frameParent.overlay.views.size()==1,"layout starts recovered decoration without a setter event");
  ImageView image=(ImageView)root.frameParent.overlay.views.get(0);long until=System.currentTimeMillis()+5000;
  while(image.drawable==null && System.currentTimeMillis()<until){Handler.drain();Thread.sleep(10);}
  check(image.drawable instanceof AnimationDrawable && ((AnimationDrawable)image.drawable).running,"retained request URI reaches actual bundled PNG decoder");
  check(root.frame.alpha==0 && image.width==144,"recovered frame aligns and replaces only static decoration after load");
  Method report=AlwaysAnimateNative.class.getDeclaredMethod("imageReportText");report.setAccessible(true);String text=(String)report.invoke(null);
  check(text.contains("source=decoration-png") && !text.contains("badge@"),"report identifies decoration source without unrelated icon noise");
  plugin.onStop.invoke(ctx);Handler.drain();check(root.frameParent.overlay.views.isEmpty() && root.frame.alpha==1,"recovered frame cleans up");
  System.out.println("PASS: decoration URI recovered from opaque controller request without String setter/model URL; deferred zero-size layout, real decoding, alignment and cleanup.");
 }
}
