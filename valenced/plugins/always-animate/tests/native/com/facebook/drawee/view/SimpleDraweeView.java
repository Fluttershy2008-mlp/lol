package com.facebook.drawee.view;
import com.facebook.drawee.controller.AbstractDraweeController;
public class SimpleDraweeView extends android.view.View {
 public AbstractDraweeController controller;
 public String loadedUrl;
 public int viewId=42;
 // Simulate an obfuscated String setter and a controller which no longer
 // exposes its request URI. Source tracking must happen at this boundary.
 public void q(String source){loadedUrl=source;controller=new AbstractDraweeController(null);controller.supportsAnimation=source!=null && source.contains(".gif");}
 public AbstractDraweeController z(){return controller;}
 public int getId(){return viewId;}
 public Resources getResources(){return new Resources();}
 public static class Resources extends android.content.res.Resources {public String getResourceEntryName(int id){return id==42?"author_avatar":id==43?"author_avatar_decoration":"attachment";}}
}
