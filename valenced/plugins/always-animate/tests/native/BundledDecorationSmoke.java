import app.valenced.plugins.*;import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;import de.robv.android.xposed.XposedBridge;import java.io.*;
import android.view.*;import android.widget.ImageView;import android.graphics.drawable.*;import android.os.Handler;import com.facebook.drawee.view.SimpleDraweeView;
public class BundledDecorationSmoke {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static AnimationDrawable await(ImageView image)throws Exception {
  long until=System.currentTimeMillis()+5000;
  while(image.drawable==null && System.currentTimeMillis()<until){Handler.drain();Thread.sleep(10);}
  check(image.drawable instanceof AnimationDrawable,"bundled PNG animation decoded and assigned");return (AnimationDrawable)image.drawable;
 }
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/bundled-storage");dir.mkdirs();
  PluginScope ctx=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return new ClassLoader(BundledDecorationSmoke.class.getClassLoader()){protected Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException{if(name.contains("APNG")||name.contains("animated_png"))throw new ClassNotFoundException(name);return super.loadClass(name,resolve);}};}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(ctx);
  SimpleDraweeView frame=new SimpleDraweeView();frame.viewId=43;ViewGroup parent=new ViewGroup();frame.parent=parent;
  String source="https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png?passthrough=false";
  XposedBridge.invoke(frame,"q",source);check(parent.overlay.views.size()==1,"frame view created without any host APNG classes");ImageView image=(ImageView)parent.overlay.views.get(0);
  check(frame.alpha==1,"static fallback remains until successful decoding");AnimationDrawable animation=await(image);
  check(animation.running && !animation.once && animation.frames.size()==4,"real APNG frames loop through native Android animation");check(frame.alpha==0,"native static frame hidden after decoding");
  check(image.left==frame.left && image.width==frame.width,"overlay uses decoration geometry");
  XposedBridge.invoke(frame,"q",source);check(image.drawable==animation && parent.overlay.views.size()==1,"same source retains single animation");
  frame.relayout(18,24,90,90);check(image.left==18 && image.top==24 && image.width==90,"frame tracks message row layout");
  frame.detach();check(!animation.running && parent.overlay.views.isEmpty() && frame.alpha==1,"scroll detach stops animation and restores fallback");
  frame.attach();AnimationDrawable again=await(image);check(again!=animation && again.running && frame.alpha==0,"reattach creates independent active animation from shared bitmap cache");
  XposedBridge.invoke(frame,"q",(Object)null);check(parent.overlay.views.isEmpty() && !again.running && frame.layouts.isEmpty(),"decoration removal stops and cleans listeners");
  // A queued completion must not resurrect a recycled row or hide its next static frame.
  XposedBridge.invoke(frame,"q",source);ImageView pending=(ImageView)parent.overlay.views.get(0);XposedBridge.invoke(frame,"q",(Object)null);Thread.sleep(30);Handler.drain();check(pending.drawable==null && frame.alpha==1 && parent.overlay.views.isEmpty(),"stale queued completion discarded");
  XposedBridge.invoke(frame,"q",source);ImageView last=(ImageView)parent.overlay.views.get(0);AnimationDrawable finalAnimation=await(last);plugin.onStop.invoke(ctx);Handler.drain();
  check(parent.overlay.views.isEmpty() && !finalAnimation.running && frame.alpha==1 && XposedBridge.hooks.isEmpty(),"disable cleans animation, fallback and native hooks");
  System.out.println("PASS: bundled frame player with Discord APNG classes unavailable; actual image decoding, async UI handoff, looping, geometry, scroll, stale completion and cleanup.");
 }
}
