import app.valenced.plugins.*;import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;import de.robv.android.xposed.XposedBridge;import java.io.*;
import android.view.ViewGroup;import android.widget.ImageView;import android.graphics.drawable.AnimationDrawable;import android.os.Handler;import com.facebook.drawee.view.SimpleDraweeView;
public class ModernDecorationSmoke {
 static void check(boolean b,String text){if(!b)throw new AssertionError(text);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/bundled-storage");dir.mkdirs();
  PluginScope ctx=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return ModernDecorationSmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(ctx);
  SimpleDraweeView frame=new SimpleDraweeView();frame.viewId=43;frame.width=frame.height=144;ViewGroup parent=new ViewGroup();frame.parent=parent;
  XposedBridge.invoke(frame,"q","https://cdn.discordapp.com/media/v1/collectibles-shop/123456/static");
  check(parent.overlay.views.size()==1,"modern shop decoration recognised despite lacking a PNG extension");ImageView image=(ImageView)parent.overlay.views.get(0);long until=System.currentTimeMillis()+5000;
  while(image.drawable==null&&System.currentTimeMillis()<until){Handler.drain();Thread.sleep(10);}
  check(image.drawable instanceof AnimationDrawable && ((AnimationDrawable)image.drawable).running,"static shop endpoint becomes animated and decodes real APNG bytes");
  check(frame.alpha==0,"static decoration replaced after successful decoding");plugin.onStop.invoke(ctx);Handler.drain();check(parent.overlay.views.isEmpty() && frame.alpha==1,"cleanup");
  System.out.println("PASS: modern collectibles-shop decoration recognition, static-to-animated route, real PNG decoding, playback and cleanup.");
 }
}
