package com.discord.chat.presentation.message;
import com.discord.chat.bridge.Message;
import com.facebook.drawee.controller.AbstractDraweeController;
import com.facebook.drawee.controller.AbstractDraweeControllerBuilder;
public class MessageView extends android.view.ViewGroup {
 public String boundUrl;
 public boolean bypassSetterHook;
 public final Avatar avatar=new Avatar();
 public final Avatar frame=new Avatar();
 public final android.view.ViewGroup frameParent=new android.view.ViewGroup();
 public MessageView(){frame.viewId=43;addView(avatar);addView(frameParent);frameParent.addView(frame);}
 public void setMessage(Message message){try{if(bypassSetterHook)avatar.q(message.loadedAvatar());else de.robv.android.xposed.XposedBridge.invoke(avatar,"q",message.loadedAvatar());boundUrl=avatar.loadedUrl;}catch(Throwable e){throw new RuntimeException(e);}}
 public Context getContext(){return new Context();}
 public Resources getResources(){return new Resources();}
 public Object findViewById(int id){return id==42?avatar:id==43?frame:null;}
 public static class Context extends android.content.Context {public String getPackageName(){return "test.discord";}}
 public static class Resources {public int getIdentifier(String name,String kind,String pkg){return name.equals("author_avatar")?42:name.equals("author_avatar_decoration")?43:0;}}
 public static class Avatar extends com.facebook.drawee.view.SimpleDraweeView {}
}
