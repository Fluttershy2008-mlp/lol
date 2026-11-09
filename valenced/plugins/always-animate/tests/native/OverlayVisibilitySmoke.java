import app.valenced.plugins.*;import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;import de.robv.android.xposed.XposedBridge;import java.io.*;
import android.widget.ImageView;import android.graphics.drawable.AnimationDrawable;import android.os.Handler;import com.discord.chat.presentation.message.MessageView;
public class OverlayVisibilitySmoke {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/bundled-storage");dir.mkdirs();
  PluginScope ctx=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return OverlayVisibilitySmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(ctx);
  MessageView root=new MessageView();root.parent=new Object();root.frame.width=root.frame.height=144;
  XposedBridge.invoke(root.frame,"q","https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png?passthrough=false");
  check(root.frameParent.overlay.views.size()==1,"overlay created");ImageView image=(ImageView)root.frameParent.overlay.views.get(0);long until=System.currentTimeMillis()+5000;
  while(image.drawable==null && System.currentTimeMillis()<until){Handler.drain();Thread.sleep(10);}
  check(image.drawable instanceof AnimationDrawable,"fixture decoded");AnimationDrawable animation=(AnimationDrawable)image.drawable;
  check(animation.running && image.visibility==0,"visible frame plays with non-View root parent");
  root.avatar.visibility=8;root.frame.observer.draw();check(image.visibility==8 && !animation.running && root.avatar.visibility==8,"hidden/grouped avatar also hides its frame without changing the avatar");
  root.avatar.visibility=0;root.frame.observer.draw();check(image.visibility==0 && animation.running && image.drawable==animation,"reappearance resumes same animation without a download/redecode");
  root.alpha=0;root.frame.observer.draw();check(image.visibility==8 && !animation.running && root.alpha==0,"filtered transparent row suppresses overlay and retains host alpha");
  root.alpha=1;root.frame.observer.draw();check(image.visibility==0 && animation.running,"unhidden owner resumes");
  root.frame.visibility=8;root.frame.observer.draw();check(image.visibility==8 && !animation.running,"source visibility change hides overlay without layout/detachment");
  root.frame.visibility=0;root.frame.observer.draw();check(image.visibility==0 && animation.running,"source visibility restored");
  root.frame.detach();check(root.frame.observer.listeners.isEmpty() && root.frameParent.overlay.views.isEmpty(),"detach removes root observer and overlay");root.frame.attach();
  check(root.frame.observer.listeners.size()==1,"reattach adds exactly one visibility listener");plugin.onStop.invoke(ctx);Handler.drain();
  check(root.frame.observer.listeners.isEmpty() && root.frameParent.overlay.views.isEmpty() && root.frame.alpha==1,"disable restores source and removes visibility listeners");
  System.out.println("PASS: hidden/grouped avatar, hidden/transparent parent, visibility without layout, resume without reload, non-View root, observer lifecycle and cleanup.");
 }
}
