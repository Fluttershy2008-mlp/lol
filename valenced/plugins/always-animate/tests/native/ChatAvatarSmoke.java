import app.valenced.plugins.*;
import dev.fluttershy.alwaysanimate.AlwaysAnimateNative;
import de.robv.android.xposed.XposedBridge;
import com.discord.chat.bridge.Message;
import com.discord.chat.presentation.message.MessageView;
import java.io.*;
public class ChatAvatarSmoke {
 static void check(boolean value,String text){if(!value)throw new AssertionError(text);}
 public static void main(String[] args)throws Throwable {
  final File dir=new File("native-build/chat-storage");dir.mkdirs();
  FileOutputStream file=new FileOutputStream(new File(dir,"storage.json"));file.write("{\"images\":true}".getBytes("UTF-8"));file.close();
  PluginScope scope=new PluginScope(){public File getStorageDir(){return dir;}public ClassLoader getClassLoader(){return ChatAvatarSmoke.class.getClassLoader();}public boolean getStartedLate(){return false;}public void requireReload(){}};
  PluginBuilder plugin=AlwaysAnimateNative.getPlugin();plugin.onStart.invoke(scope);
  check(XposedBridge.hooks.size()==4,"controller, native chat bind and image setter hooks attached");
  MessageView view=new MessageView();
  String text="https://cdn.discordapp.com/avatars/1/a_literal.avif";
  for(String format:new String[]{"webp","avif"}) {
   Message message=new Message("https://cdn.discordapp.com/avatars/1/a_chat."+format+"?size=80&format="+format,text);
   // No controller onAttach event: the message row is rebound while its view
   // is already on screen, exactly the path omitted from beta6's fixtures.
   XposedBridge.invoke(view,"setMessage",message);
   check(view.boundUrl.equals("https://cdn.discordapp.com/avatars/1/a_chat.gif?size=80"),"native chat consumes GIF before constructing image request");
   check(message.content.equals(text),"message content remains exact");
   view.avatar.controller.onNewResultInternal();
   XposedBridge.invoke(view.avatar.controller,"getAnimatable");
   check(view.avatar.controller.animation.starts>0,"chat avatar starts after async completion without reattachment");
  }
  Message opaque=new Message("https://cdn.discordapp.com/avatars/1/a_hidden.webp?format=webp",text,true);
  XposedBridge.invoke(view,"setMessage",opaque);
  check(opaque.avatarURL==null,"native message layout remains opaque to old field hook");
  check(view.boundUrl.equals("https://cdn.discordapp.com/avatars/1/a_hidden.gif"),"actual chat image setter receives GIF despite opaque message model");
  view.avatar.controller.onNewResultInternal();XposedBridge.invoke(view.avatar.controller,"getAnimatable");
  check(view.avatar.controller.animation.starts>0,"controller playback works without any retained request URI");
  view.bypassSetterHook=true;
  XposedBridge.invoke(view,"setMessage",new Message("https://cdn.discordapp.com/avatars/1/a_prepared.gif",text,true));
  view.avatar.controller.onNewResultInternal();XposedBridge.invoke(view.avatar.controller,"getAnimatable");
  check(view.avatar.controller.animation.starts>0,"existing GIF chat avatar plays without a model URL, retained request or setter event");
  view.bypassSetterHook=false;
  com.facebook.drawee.view.SimpleDraweeView attachment=new com.facebook.drawee.view.SimpleDraweeView();attachment.viewId=99;
  String untouched="https://cdn.discordapp.com/avatars/1/a_preview.webp";
  XposedBridge.invoke(attachment,"q",untouched);
  check(attachment.loadedUrl.equals(untouched),"other image views untouched by chat setter hook");
  Message stationary=new Message("https://cdn.discordapp.com/avatars/1/static.avif",text);
  XposedBridge.invoke(view,"setMessage",stationary);
  check(view.boundUrl.equals(stationary.avatarURL),"static avatar URL preserved");
  view.avatar.controller.onNewResultInternal();XposedBridge.invoke(view.avatar.controller,"getAnimatable");
  check(view.avatar.controller.animation.starts==0,"static avatar is not forced to animate");
  plugin.onStop.invoke(scope);check(XposedBridge.hooks.isEmpty(),"all native hooks removed");
  System.out.println("PASS: direct native author_avatar setter, renamed setter, opaque message model, request-free controller, asynchronous playback, AVIF/WebP, static and attachment preservation, cleanup.");
 }
}
