import app.valenced.plugins.*;import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;import de.robv.android.xposed.XposedBridge;import java.io.*;import java.lang.reflect.*;import java.nio.file.*;
import com.discord.chat.bridge.Message;import com.discord.chat.presentation.message.MessageView;import com.facebook.drawee.controller.AbstractDraweeController;import com.facebook.drawee.view.SimpleDraweeView;import android.os.Handler;
public class FrescoImagesSmoke {
 static void check(boolean b,String text){if(!b)throw new AssertionError(text);}
 static String report()throws Exception{Method m=AlwaysAnimateNative.class.getDeclaredMethod("imageReportText");m.setAccessible(true);return (String)m.invoke(null);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/bundled-storage");dir.mkdirs();
  PluginScope ctx=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return FrescoImagesSmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(ctx);
  MessageView root=new MessageView();root.avatar.width=root.avatar.height=120;root.frame.width=root.frame.height=144;
  String url="https://cdn.discordapp.com/avatar-decoration-presets/a_fixture.png";
  Message message=new Message("https://cdn.discordapp.com/avatars/1/a_user.gif","text");message.avatarDecorationURL=url;
  AbstractDraweeController nativeFrame=new AbstractDraweeController(null);nativeFrame.loaded=true;root.frame.controller=nativeFrame;
  SimpleDraweeView other=new SimpleDraweeView();other.viewId=99;other.width=other.height=144;other.controller=new AbstractDraweeController(null);other.controller.loaded=true;root.addView(other);
  XposedBridge.invoke(root,"setMessage",message);
  check(nativeFrame.animation.starts==1 && nativeFrame.animation.isRunning(),"stopped decoration animation restarts through Fresco controller");
  check(root.frameParent.overlay.views.isEmpty(),"existing Fresco animation does not get a bundled overlay");
  root.avatar.controller.onNewResultInternal();XposedBridge.invoke(root.avatar.controller,"getAnimatable");
  check(root.avatar.controller.animation.starts==1,"avatar controller starts on asynchronous completion");
  Handler.drain();check(nativeFrame.animation.starts==1,"delayed probes never restart an already running animation");
  check(other.controller.animation.starts==0,"matching decoration dimensions do not authorise animating attachments");
  String text=report();check(text.contains("author_avatar@") && text.contains("120x120") && text.contains("author_avatar_decoration@") && text.contains("144x144") && text.contains("last-start=false->true"),"per-view diagnostics include both actual sizes, controllers and start result");
  nativeFrame.animation.stop();XposedBridge.invoke(nativeFrame,"onAttach");check(nativeFrame.animation.starts==2,"reattach resumes decoration even without an animated-avatar request URI");
  nativeFrame.animation.stop();XposedBridge.invoke(nativeFrame,"getAnimatable");check(nativeFrame.animation.starts==3,"stopped native decoration resumes again");
  // An async decoder may not have a drawable at message bind time.
  AbstractDraweeController pending=new AbstractDraweeController(null);root.frame.controller=pending;XposedBridge.invoke(root,"setMessage",message);
  check(report().contains("none-yet (pending or still)"),"missing animation is not falsely labelled definitively static");
  pending.loaded=true;XposedBridge.invoke(pending,"getAnimatable");check(pending.animation.starts==1 && root.frameParent.overlay.views.isEmpty(),"async Fresco animation takes over from bundled fallback");
  nativeFrame.animation.stop();XposedBridge.invoke(nativeFrame,"getAnimatable");check(nativeFrame.animation.starts==3,"stale controller completion cannot restart recycled view's old animation");
  Handler.drain();check(root.frameParent.overlay.views.isEmpty(),"cancelled fallback load cannot reappear over a live controller animation");
  plugin.onStop.invoke(ctx);Handler.drain();check(XposedBridge.hooks.isEmpty() && !pending.animation.running,"disable cleans native controllers and queued probes");
  System.out.println("PASS: 120x120 avatar and 144x144 decoration controller playback, per-view report, idempotence, pending async load, fallback takeover, unrelated images, stale controllers and cleanup.");
 }
}
