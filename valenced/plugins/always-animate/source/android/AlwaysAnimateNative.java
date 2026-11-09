/* SPDX-License-Identifier: GPL-3.0-or-later */
package dev.fluttershy.alwaysanimate;

import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import java.io.*;
import java.lang.ref.WeakReference;
import java.lang.reflect.*;
import java.util.*;
import java.util.regex.Pattern;

/** Android chat avatar playback. Host classes are provided by Valenced/Fresco. */
public final class AlwaysAnimateNative {
  private static final List<XC_MethodHook.Unhook> hooks = new ArrayList<XC_MethodHook.Unhook>();
  private static final Map<Object,Boolean> controllers = Collections.synchronizedMap(new WeakHashMap<Object,Boolean>());
  private static final Pattern AVATAR = Pattern.compile("^https://(?:cdn\\.discordapp\\.com|media\\.discordapp\\.net)/(?:avatars/[^/]+/|guilds/[^/]+/users/[^/]+/avatars/)a_[a-zA-Z0-9_]+\\.(?:gif|webp|png|avif|jpe?g)(?:[?#].*)?$");
  private static final Pattern DISABLED = Pattern.compile("\"images\"\\s*:\\s*false");
  private static volatile boolean active;
  private static File storageDir;
  private static boolean images = true;
  private static long checked, written;
  private static int builds, starts, errors;
  private static String state = "not-started";
  private static String detail = "";
  private static Class<?> controllerType;
  private static Method animationGetter;
  // Cache reflection metadata, never request values: Fresco reuses controllers
  // and may replace their source even when the controller identity is unchanged.
  private static final Map<Class<?>,Field[]> requestFields=new HashMap<Class<?>,Field[]>();
  private static final Map<Class<?>,Method> controllerGetters=new HashMap<Class<?>,Method>();
  private static int inspections, requestUris, rewrites;
  private static int chatHooks, chatBinds, chatUrls, chatRewrites, chatViews;
  private static final Map<Class<?>,List<Field>> messageFields=new HashMap<Class<?>,List<Field>>();
  private static int chatSetHooks, chatSourceSets, chatSourceAnimated;

  // Decorations are APNG assets, not a_ avatar GIFs. Fresco displays only their
  // first PNG frame. A bundled APNG decoder uses Android AnimationDrawable.
  private static final Map<Object,WeakReference<Decoration>> decorations = new WeakHashMap<Object,WeakReference<Decoration>>();
  private static String decorationDetail="";
  private static String decorationState="not-resolved";
  private static int decorationCreates, decorationLoads, decorationReady, decorationErrors, decorationFrameCount;

  private static final ThreadLocal<Boolean> probing=new ThreadLocal<Boolean>();
  private static final Map<Object,ImageProbe> imageProbes=new WeakHashMap<Object,ImageProbe>();
  private static final Map<Object,WeakReference<ImageProbe>> controllerProbes=Collections.synchronizedMap(new WeakHashMap<Object,WeakReference<ImageProbe>>());
  private static final LinkedHashMap<String,String> imageReport=new LinkedHashMap<String,String>();
  private static final Map<Object,ProbeTask> probeTasks=new WeakHashMap<Object,ProbeTask>();
  private static final class ImageProbe {
    final WeakReference<Object> view;
    final String key,kind;
    WeakReference<Object> controller=new WeakReference<Object>(null);
    String format="unknown",lastStart="";int restarts;
    final boolean playback;
    ImageProbe(Object object,String type,boolean play){view=new WeakReference<Object>(object);kind=type;playback=play;key=type+"@"+Integer.toHexString(System.identityHashCode(object));}
  }
  private static boolean ensureRunning(Object animation)throws Exception {
    try{if(Boolean.TRUE.equals(call(animation,"isRunning")))return false;}catch(NoSuchMethodException ignored){}
    call(animation,"start");starts++;return true;
  }
  private static String running(Object animation) {
    try{return String.valueOf(call(animation,"isRunning"));}catch(Exception ignored){return "unknown";}
  }
  private static void reportImage(ImageProbe probe,Object controller,Object animation,String stage) {
    Object view=probe.view.get();if(view==null)return;
    try {
      String before=animation==null?"n/a":running(animation);boolean restarted=false;
      if(animation!=null && probe.playback && allowed() && Boolean.TRUE.equals(call(view,"isAttachedToWindow"))) {
        controllers.put(controller,Boolean.TRUE);restarted=ensureRunning(animation);
        if(restarted){probe.restarts++;probe.lastStart=before+"->"+running(animation);}
        if(probe.kind.equals("author_avatar_decoration")) {
          WeakReference<Decoration> reference=decorations.remove(view);
          Decoration overlay=reference==null?null:reference.get();if(overlay!=null)closeOnMain(overlay);
        }
      }
      String dimensions=call(view,"getWidth")+"x"+call(view,"getHeight");
      String line=probe.key+" "+dimensions+" ["+stage+"] source="+probe.format+
        " controller="+(controller==null?"none":controller.getClass().getName())+
        " animation="+(animation==null?"none-yet (pending or still)":animation.getClass().getName())+
        (animation==null?"":" running="+before+"->"+running(animation)+" restarts="+probe.restarts+(probe.lastStart.length()>0?" last-start="+probe.lastStart:""));
      synchronized(imageReport){imageReport.remove(probe.key);imageReport.put(probe.key,line);while(imageReport.size()>12)imageReport.remove(imageReport.keySet().iterator().next());}
    }catch(Exception error){
      synchronized(imageReport){imageReport.put(probe.key,probe.key+" ["+stage+"] error="+exceptionDetail(error));}
    }
  }
  private static boolean probeImage(Object view,String stage,String source) {
    if(view==null || !allowed())return false;
    String kind=resourceName(view);boolean playback=kind.equals("author_avatar") || kind.equals("author_avatar_decoration");
    if(!playback)return false;
    if(kind.length()==0)kind="unidentified-fresco";
    ImageProbe probe=imageProbes.get(view);
    if(probe==null){probe=new ImageProbe(view,kind,playback);imageProbes.put(view,probe);}
    boolean recover=source==null;
    try {
      Object controller=viewController(view),old=probe.controller.get();
      if(old!=null && old!=controller){controllerProbes.remove(old);if(probe.playback)controllers.remove(old);}
      probe.controller=new WeakReference<Object>(controller);
      if(recover && controller!=null)source=requestSource(controller,0,new int[]{96},new IdentityHashMap<Object,Boolean>());
      if(source!=null)probe.format=sourceFormat(source);
      if(controller!=null)controllerProbes.put(controller,new WeakReference<ImageProbe>(probe));
      Object animation=null;probing.set(Boolean.TRUE);
      try{if(controller!=null)animation=animatable(controller);}finally{probing.remove();}
      reportImage(probe,controller,animation,stage);writeStatus(false);
      if(recover && animation==null && kind.equals("author_avatar_decoration") && isDecoration(source))
        updateDecoration(view,source,false);
      return animation!=null && playback;
    }catch(Exception error){reportImage(probe,null,null,stage+": "+error.getClass().getSimpleName());return false;}
  }
  private static String sourceFormat(String source) {
    String path=source.replaceFirst("[?#].*","");String extension=path.replaceFirst("^.*\\.","");
    if(isDecoration(source))return source.contains("/collectibles-shop/")?"decoration-shop-"+(source.contains("/animated")?"animated":"static"):"decoration-"+extension;
    if(isAvatar(source))return "animated-avatar-"+extension;
    if(source.contains("/avatars/"))return "static-avatar-"+extension;
    return "other-cdn-image";
  }
  // Some native loaders call setController directly, bypassing setImageURI.
  // Recover its actual retained request URI rather than assuming the setter ran.
  private static String requestSource(Object object,int depth,int[] budget,IdentityHashMap<Object,Boolean> seen) {
    if(object==null || depth>4 || --budget[0]<0 || seen.put(object,Boolean.TRUE)!=null)return null;
    Class<?> type=object.getClass();
    if(object instanceof String || uriType(type)) {
      String value=object.toString();
      return value.matches("^https://(?:cdn\\.discordapp\\.com|media\\.discordapp\\.net)/.*")?value:null;
    }
    if(type.isArray()) {
      if(type.getComponentType().isPrimitive())return null;
      for(int i=0;i<Math.min(Array.getLength(object),16);i++){String found=requestSource(Array.get(object,i),depth+1,budget,seen);if(found!=null)return found;}
      return null;
    }
    if(type.getName().startsWith("java.") || type.getName().startsWith("android.") || type.getName().startsWith("kotlin."))return null;
    String first=null;
    for(Field field:requestFields(type)) {
        try{String found=requestSource(field.get(object),depth+1,budget,seen);
          if(isDecoration(found))return found;if(first==null && found!=null)first=found;
        }catch(Throwable ignored){}
      }
    return first;
  }
  private static boolean isFrescoView(Object view) {
    for(Class<?> c=view.getClass();c!=null;c=c.getSuperclass())if(c.getName().equals("com.facebook.drawee.view.SimpleDraweeView"))return true;
    return false;
  }
  private static void probeTree(Object root,String stage,int depth,int[] remaining) {
    if(root==null || depth>8 || --remaining[0]<0)return;
    if(isFrescoView(root))probeImage(root,stage,null);
    try {
      int count=((Number)call(root,"getChildCount")).intValue();
      for(int i=0;i<count && remaining[0]>0;i++)probeTree(call(root,"getChildAt",new Class<?>[]{int.class},i),stage,depth+1,remaining);
    }catch(Exception ignored){}
  }
  private static void probeMessage(Object root,String stage) {
    if(!allowed())return;
    try {
      Object resources=call(root,"getResources"),context=call(root,"getContext");
      for(String name:new String[]{"author_avatar","author_avatar_decoration"}) {
        int id=((Number)call(resources,"getIdentifier",new Class<?>[]{String.class,String.class,String.class},name,"id",String.valueOf(call(context,"getPackageName")))).intValue();
        if(id!=0)probeImage(call(root,"findViewById",new Class<?>[]{int.class},id),stage,null);
      }
    }catch(Exception ignored){}
    // Read-only diagnostics for additional Fresco views; dimensions alone never
    // authorise starting arbitrary attachment or embed image animations.

  }
  private static final class ProbeTask implements Runnable {
    final WeakReference<Object> root;
    ProbeTask(Object view){root=new WeakReference<Object>(view);}
    public void run(){Object view=root.get();if(view==null || !allowed() || probeTasks.get(view)!=this)return;
      probeMessage(view,"bind+250ms");writeStatus(false);probeTasks.remove(view);
    }
  }
  private static void scheduleProbes(Object view) {
    ProbeTask old=probeTasks.remove(view);
    if(old!=null)try{call(view,"removeCallbacks",new Class<?>[]{Runnable.class},old);}catch(Exception ignored){}
    ProbeTask task=new ProbeTask(view);probeTasks.put(view,task);
    try{call(view,"postDelayed",new Class<?>[]{Runnable.class,long.class},task,250L);}catch(Exception ignored){probeTasks.remove(view);}
  }
  private static String imageReportText() {
    StringBuilder out=new StringBuilder();synchronized(imageReport){for(String line:imageReport.values()){if(out.length()>0)out.append("\n");out.append(line);}}
    return out.length()==0?"No chat image views inspected yet. Open a chat, then reopen this page.":out.toString();
  }

  public static PluginBuilder getPlugin() {
    PluginBuilder builder = new PluginBuilder();
    builder.start(new Function1<PluginScope,Unit>() {
      public Unit invoke(PluginScope ctx) { install(ctx); return Unit.INSTANCE; }
    });
    builder.stop(new Function1<PluginScope,Unit>() {
      public Unit invoke(PluginScope ctx) { dispose(); return Unit.INSTANCE; }
    });
    return builder;
  }

  private static Object call(Object target, String name, Class<?>[] types, Object... args) throws Exception {
    Method m = target.getClass().getMethod(name, types);
    m.setAccessible(true);
    return m.invoke(target, args);
  }
  private static Object call(Object target, String name) throws Exception {
    return call(target, name, new Class<?>[0]);
  }

  static boolean isAvatar(String uri) { return uri != null && AVATAR.matcher(uri).matches(); }
  private static String gifUrl(String source) {
    return source.replaceFirst("\\.(?:webp|png|avif|jpe?g)(?=[?#]|$)",".gif")
      .replaceAll("([?&])(?:format=(?:webp|png|avif|jpe?g)|animated=false)(?=&|#|$)","$1")
      .replace("?&","?").replaceAll("&&+","&").replaceAll("[?&](?=#|$)","");
  }
  private static boolean allowed() {
    if (!active) return false;
    long now = System.currentTimeMillis();
    if (now - checked > 500) {
      checked = now;
      try {
        File settings = new File(storageDir, "storage.json");
        if (settings.isFile() && settings.length() < 65536) {
          ByteArrayOutputStream out = new ByteArrayOutputStream();
          InputStream in = new FileInputStream(settings);
          try { byte[] buf = new byte[1024]; int n; while ((n = in.read(buf)) != -1) out.write(buf,0,n); }
          finally { in.close(); }
          images = !DISABLED.matcher(out.toString("UTF-8")).find();
        } else images = true;
      } catch (Exception ignored) { /* keep last valid setting */ }
    }
    return images;
  }
  // R8 also renames the ImageRequest class, its getter and its fields. Its
  // android.net.Uri field type is stable and can be inspected without names.
  private static boolean requestContainsAvatar(Object value) {
    if(value==null || (controllerType!=null && controllerType.isInstance(value)))return false;
    Class<?> type=value.getClass();
    for(Class<?> c=type;c!=null;c=c.getSuperclass())
      if(c.getName().equals("android.net.Uri"))return isAvatar(value.toString());
    if(type.isArray()) {
      if(type.getComponentType().isPrimitive())return false;
      int n=Math.min(Array.getLength(value),16);
      for(int i=0;i<n;i++)if(requestContainsAvatar(Array.get(value,i)))return true;
      return false;
    }
    if(type.getName().startsWith("java.") || type.getName().startsWith("android."))return false;
    for(Class<?> c=type;c!=null && c!=Object.class;c=c.getSuperclass())
      for(Field field:c.getDeclaredFields()) {
        if(Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive())continue;
        boolean uriType=false;
        for(Class<?> t=field.getType();t!=null;t=t.getSuperclass())if(t.getName().equals("android.net.Uri")){uriType=true;break;}
        if(!uriType)continue;
        try{field.setAccessible(true);Object uri=field.get(value);if(uri!=null && isAvatar(uri.toString()))return true;}catch(Throwable ignored){}
      }
    return false;
  }
  private static boolean avatarBuilder(Object builder) {
    try { Object request=call(builder,"getImageRequest");
      if(request!=null) {
        try{return isAvatar(String.valueOf(call(request,"getSourceUri")));}catch(Exception ignored){}
        return requestContainsAvatar(request);
      }
    }catch(Exception ignored){}
    for(Class<?> c=builder.getClass();c!=null && c!=Object.class;c=c.getSuperclass())
      for(Field field:c.getDeclaredFields()) {
        if(Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive())continue;
        try{field.setAccessible(true);if(requestContainsAvatar(field.get(builder)))return true;}catch(Throwable ignored){}
      }
    return false;
  }
  private static Object animatable(Object controller) throws Exception {
    if(animationGetter!=null && animationGetter.getDeclaringClass().isInstance(controller))
      return animationGetter.invoke(controller);
    try{return call(controller,"getAnimatable");}catch(NoSuchMethodException ignored){}
    // A method returning Android's platform Animatable retains this type even
    // when its owning class and method name have both been renamed.
    for(Method method:controller.getClass().getMethods()) {
      if(method.getParameterTypes().length==0 && method.getReturnType().getName().equals("android.graphics.drawable.Animatable")) {
        method.setAccessible(true);return method.invoke(controller);
      }
    }
    return null;
  }
  private static void startAnimation(Object controller) {
    if (!allowed()) return;
    try {
      Object animation = animatable(controller);
      if (animation != null) { ensureRunning(animation); writeStatus(false); }
    } catch (Exception ignored) { errors++; writeStatus(false); }
  }
  private static boolean uriType(Class<?> type) {
    for(Class<?> c=type;c!=null;c=c.getSuperclass())if(c.getName().equals("android.net.Uri"))return true;
    return false;
  }
  private static Field[] requestFields(Class<?> type) {
    synchronized(requestFields) {
      Field[] cached=requestFields.get(type);if(cached!=null)return cached;
      List<Field> fields=new ArrayList<Field>();
      for(Class<?> c=type;c!=null && c!=Object.class;c=c.getSuperclass())
        for(Field field:c.getDeclaredFields()) {
          if(Modifier.isStatic(field.getModifiers()) || field.getType().isPrimitive())continue;
          try{field.setAccessible(true);fields.add(field);}catch(Throwable ignored){}
        }
      Field[] result=fields.toArray(new Field[fields.size()]);
      if(requestFields.size()<256)requestFields.put(type,result);
      return result;
    }
  }
  // PipelineDraweeController retains ImageRequest directly and through its
  // DataSourceSupplier. Inspect these bounded request holders before onAttach
  // submits the request. This does not depend on a controller-builder class.
  private static boolean prepareController(Object controller) {
    inspections++;
    final IdentityHashMap<Object,Boolean> seen=new IdentityHashMap<Object,Boolean>();
    final Set<String> previousUrls=new HashSet<String>();
    boolean animated=inspectRequests(controller,0,new int[]{256},seen,previousUrls);
    controllers.remove(controller);
    if(animated){controllers.put(controller,Boolean.TRUE);builds++;}
    if(!previousUrls.isEmpty()) {
      // Fresco's controller-level cache shortcut was keyed before this request
      // URI was rewritten. Clear only a key which still equals that old URI.
      // PipelineDraweeController#getCachedImage safely returns null for no key.
      for(Field field:requestFields(controller.getClass())) {
          if(Modifier.isFinal(field.getModifiers()) || field.getType()==String.class || uriType(field.getType()))continue;
          try{Object value=field.get(controller);
            if(value!=null && previousUrls.contains(value.toString()))field.set(controller,null);
          }catch(Throwable ignored){}
        }
    }
    writeStatus(false);
    return animated;
  }
  private static boolean inspectRequests(Object value,int depth,int[] budget,IdentityHashMap<Object,Boolean> seen,Set<String> previousUrls) {
    if(value==null || depth>3 || --budget[0]<0 || seen.put(value,Boolean.TRUE)!=null)return false;
    Class<?> type=value.getClass();
    if(type.isArray()) {
      if(type.getComponentType().isPrimitive())return false;
      boolean found=false;
      for(int i=0;i<Math.min(Array.getLength(value),16);i++)found=inspectRequests(Array.get(value,i),depth+1,budget,seen,previousUrls)||found;
      return found;
    }
    if(type.getName().startsWith("java.") || type.getName().startsWith("android.") || type.getName().startsWith("kotlin."))return false;
    if(depth>0 && controllerType!=null && controllerType.isInstance(value))return false;
    boolean found=false;
    for(Field field:requestFields(type)) {
        try {
          Object child=field.get(value);
          if(child==null)continue;
          if(uriType(field.getType())) {
            String source=child.toString();
            if(source.contains("/avatars/"))requestUris++;
            if(!isAvatar(source))continue;
            found=true;
            String gif=gifUrl(source);
            if(!source.equals(gif)) {
              Object uri=Class.forName("android.net.Uri").getMethod("parse",String.class).invoke(null,gif);
              field.set(value,uri);previousUrls.add(source);rewrites++;
            }
          } else if(depth<3)found=inspectRequests(child,depth+1,budget,seen,previousUrls)||found;
        }catch(Throwable ignored){}
      }
    return found;
  }
  // Call Valenced's cached DexFinder rather than opening or enumerating the APK.
  // DexKit query objects are configured reflectively to use the host's version.
  private static Method findByStrings(final Object finder, String... strings) throws Exception {
    for(final String marker:strings) {
      try {
        Object result=call(finder,"findMethod",new Class<?>[]{Function1.class},new Function1<Object,Unit>() {
          public Unit invoke(Object query) {
            try {
              Class<?> matcherType=Class.forName("org.luckypray.dexkit.query.matchers.MethodMatcher",false,query.getClass().getClassLoader());
              Object matcher=matcherType.getConstructor().newInstance();
              call(matcher,"usingEqStrings",new Class<?>[]{String[].class},(Object)new String[]{marker});
              call(query,"matcher",new Class<?>[]{matcherType},matcher);
              return Unit.INSTANCE;
            }catch(Exception e){throw new IllegalStateException("Cannot configure DexFinder",e);}
          }
        });
        if(result instanceof Method){Method m=(Method)result;m.setAccessible(true);return m;}
      }catch(InvocationTargetException e){throw new IllegalStateException("DexFinder lookup failed",e.getCause());}
    }
    return null;
  }
  private static Class<?> namedClass(String name,ClassLoader loader) {
    try{return Class.forName(name,false,loader);}catch(ClassNotFoundException ignored){return null;}
  }
  private static Method namedMethod(Class<?> type,String name) {
    if(type==null)return null;
    try{Method m=type.getDeclaredMethod(name);m.setAccessible(true);return m;}catch(Exception ignored){return null;}
  }
  private static Method findMessageBind(final Object finder,final Class<?> view) throws Exception {
    Object result=call(finder,"findMethod",new Class<?>[]{Function1.class},new Function1<Object,Unit>() {
      public Unit invoke(Object query) {
        try {
          Class<?> mt=Class.forName("org.luckypray.dexkit.query.matchers.MethodMatcher",false,query.getClass().getClassLoader());
          Object matcher=mt.getConstructor().newInstance();
          call(matcher,"declaredClass",new Class<?>[]{Class.class},view);
          call(matcher,"usingEqStrings",new Class<?>[]{String[].class},(Object)new String[]{"message","messageContext","eventHandler"});
          call(query,"matcher",new Class<?>[]{mt},matcher);return Unit.INSTANCE;
        }catch(Exception e){throw new IllegalStateException("Cannot configure native message lookup",e);}
      }
    });
    return result instanceof Method?(Method)result:null;
  }
  private static boolean rewriteMessage(Object message) throws Exception {
    if(message==null)return false;
    List<Field> fields=messageFields.get(message.getClass());
    if(fields==null) {
      fields=new ArrayList<Field>();
      for(Class<?> c=message.getClass();c!=null && c!=Object.class;c=c.getSuperclass())
        for(Field f:c.getDeclaredFields())if(!Modifier.isStatic(f.getModifiers()) && f.getType()==String.class){f.setAccessible(true);fields.add(f);}
      List<Field> avatarFields=new ArrayList<Field>();
      for(Field field:fields)if(field.getName().equalsIgnoreCase("avatarURL") || field.getName().equals("avatar_url"))avatarFields.add(field);
      if(!avatarFields.isEmpty())fields=avatarFields;
      else {
        Iterator<Field> it=fields.iterator();
        while(it.hasNext())if(it.next().getName().matches("(?i).*(?:content|text|description|accessibility|username).*"))it.remove();
      }
      messageFields.put(message.getClass(),fields);
    }
    boolean animated=false;
    for(Field f:fields) {
      String source=(String)f.get(message);
      if(!isAvatar(source))continue;
      animated=true;chatUrls++;
      String gif=gifUrl(source);
      if(!gif.equals(source)){f.set(message,gif);chatRewrites++;}
    }
    return animated;
  }
  private static void playChatAvatar(Object messageView) {
    if(!allowed())return;
    try {
      Object context=call(messageView,"getContext");
      Object resources=call(messageView,"getResources");
      String packageName=String.valueOf(call(context,"getPackageName"));
      int id=((Number)call(resources,"getIdentifier",new Class<?>[]{String.class,String.class,String.class},"author_avatar","id",packageName)).intValue();
      if(id==0)return;
      Object avatar=call(messageView,"findViewById",new Class<?>[]{int.class},id);
      if(avatar==null)return;
      Object controller=viewController(avatar);
      if(controller==null)return;
      // This view is specifically the message author's avatar. Its existing
      // Animatable is sufficient proof of animation; retaining a request Uri
      // or exposing an a_ hash in the message model must not be required.
      controllers.put(controller,Boolean.TRUE);chatViews++;startAnimation(controller);
    }catch(Exception e){errors++;}
    writeStatus(false);
  }
  private static Object viewController(Object avatar) throws Exception {
    Class<?> viewType=avatar.getClass();Method getter;
    synchronized(controllerGetters) {
      if(controllerGetters.containsKey(viewType))getter=controllerGetters.get(viewType);
      else {
        getter=null;
        try{getter=viewType.getMethod("getController");}catch(NoSuchMethodException ignored){}
        if(getter==null && controllerType!=null)for(Method method:viewType.getMethods()) {
          Class<?> type=method.getReturnType();
          if(method.getParameterTypes().length==0 && type!=Object.class && type.isAssignableFrom(controllerType)) {getter=method;break;}
        }
        if(getter!=null)getter.setAccessible(true);
        if(controllerGetters.size()<128)controllerGetters.put(viewType,getter);
      }
    }
    return getter==null?null:getter.invoke(avatar);
  }
  private static String resourceName(Object view) {
    try {
      int id=((Number)call(view,"getId")).intValue();
      if(id<=0)return "";
      return String.valueOf(call(call(view,"getResources"),"getResourceEntryName",new Class<?>[]{int.class},id));
    }catch(Exception ignored){return "";}
  }
  private static boolean chatAvatarView(Object view) { return resourceName(view).equals("author_avatar"); }
  private static boolean decorationView(Object view) { return resourceName(view).equals("author_avatar_decoration"); }
  static boolean isDecoration(String source) {
    return source!=null && (source.matches("^https://(?:cdn\\.discordapp\\.com|media\\.discordapp\\.net)/avatar-decoration-presets/[A-Za-z0-9_]+\\.(?:png|webp|avif|gif)(?:[?#].*)?$") ||
      source.matches("^https://(?:cdn\\.discordapp\\.com|media\\.discordapp\\.net)/media/v1/collectibles-shop/[0-9]+/(?:[A-Za-z0-9_-]+/)*(?:static|animated)(?:[?#].*)?$"));
  }
  static String decorationUrl(String source) {
    if(source.contains("/media/v1/collectibles-shop/"))return source.replaceFirst("/static(?=[?#]|$)","/animated");
    String png=source.replaceFirst("\\.(?:webp|avif|gif)(?=[?#]|$)",".png")
      .replaceAll("([?&])(?:format=[^&#]+|animated=false|passthrough=[^&#]*)(?=&|#|$)","$1")
      .replace("?&","?").replaceAll("&&+","&").replaceAll("[?&](?=#|$)","");
    int fragment=png.indexOf('#');if(fragment>=0)png=png.substring(0,fragment);
    return png+(png.indexOf('?')>=0?"&":"?")+"passthrough=true";
  }
  private static String exceptionDetail(Throwable error) {
    StringBuilder out=new StringBuilder();
    for(int i=0;error!=null && i<5;i++,error=error.getCause()) {
      if(i>0)out.append(" <- ");
      out.append(error.getClass().getSimpleName());
      String message=error.getMessage();if(message!=null)out.append(": ").append(message);
    }
    return out.toString().replaceAll("https?://[^ ]+","[image URL]");
  }
  private static void resolveDecorations(PluginScope ctx) {
    try {
      BundledFramePlayer.checkAvailable();decorationState="ready";
      decorationDetail="bundled-APNG; Android AnimationDrawable; no Discord player lookup";
    }catch(Throwable error){decorationErrors++;decorationState="unavailable-"+error.getClass().getSimpleName();decorationDetail=exceptionDetail(error);}
  }
  private static void decorationFailure(Throwable error) {
    decorationErrors++;decorationDetail="runtime: "+exceptionDetail(error);writeStatus(false);
  }
  private static final class Decoration implements InvocationHandler {
    final WeakReference<Object> source;
    final Object widget, layoutListener, attachListener, preDrawListener;
    Object observer;
    boolean ownsAlpha;
    WeakReference<Object> avatarOwner=new WeakReference<Object>(null);
    final BundledFramePlayer player;
    Object overlay;
    String url;
    float originalAlpha;
    boolean shown, closed, loaded;
    Decoration(final Object view) throws Exception {
      source=new WeakReference<Object>(view);
      originalAlpha=((Number)call(view,"getAlpha")).floatValue();
      player=new BundledFramePlayer(call(view,"getContext"),call(view,"getResources"),storageDir,new BundledFramePlayer.Events(){
        public void loaded(String url){completed(url);}
        public void failed(Throwable error){decorationFailure(error);}
      });
      widget=player.view;
      ClassLoader loader=view.getClass().getClassLoader();
      Class<?> layoutType=Class.forName("android.view.View$OnLayoutChangeListener",false,loader);
      Class<?> attachType=Class.forName("android.view.View$OnAttachStateChangeListener",false,loader);
      layoutListener=Proxy.newProxyInstance(loader,new Class<?>[]{layoutType},this);
      attachListener=Proxy.newProxyInstance(loader,new Class<?>[]{attachType},this);
      Class<?> preDrawType=Class.forName("android.view.ViewTreeObserver$OnPreDrawListener",false,loader);
      preDrawListener=Proxy.newProxyInstance(loader,new Class<?>[]{preDrawType},this);
      call(view,"addOnLayoutChangeListener",new Class<?>[]{layoutType},layoutListener);
      call(view,"addOnAttachStateChangeListener",new Class<?>[]{attachType},attachListener);
      call(widget,"setClickable",new Class<?>[]{boolean.class},false);
      call(widget,"setFocusable",new Class<?>[]{boolean.class},false);
      call(widget,"setImportantForAccessibility",new Class<?>[]{int.class},2);
      decorationCreates++;
    }
    void completed(String completed) {
      Object original=source.get();
      if(original!=null && !closed && allowed() && url!=null && url.equals(completed)) {
        loaded=true;decorationReady++;decorationFrameCount=player.frameCount;
        try{if(shown){call(original,"setAlpha",new Class<?>[]{float.class},0f);ownsAlpha=true;syncPresentation();}}catch(Exception e){decorationFailure(e);}
        writeStatus(false);
      }
    }
    void load() throws Exception {
      player.load(url);decorationLoads++;bounds();
    }
    public Object invoke(Object proxy,Method method,Object[] args) {
      String name=method.getName();
      if(name.equals("hashCode"))return System.identityHashCode(proxy);
      if(name.equals("equals"))return proxy==args[0];
      if(name.equals("toString"))return "AlwaysAnimateDecorationListener";
      if(name.equals("onPreDraw")){try{syncPresentation();}catch(Exception e){decorationFailure(e);}return Boolean.TRUE;}
      try {
        if(name.equals("onLayoutChange")){bounds();if(!shown && !closed && allowed())attach();}
        if(name.equals("onViewAttachedToWindow") && !closed && allowed())attach();
        if(name.equals("onViewDetachedFromWindow"))detach();
      }catch(Exception e){decorationFailure(e);}
      return null;
    }
    void bounds() throws Exception {
      Object view=source.get();if(view==null || closed)return;
      int left=((Number)call(view,"getLeft")).intValue(), top=((Number)call(view,"getTop")).intValue();
      int width=((Number)call(view,"getWidth")).intValue(), height=((Number)call(view,"getHeight")).intValue();
      call(widget,"measure",new Class<?>[]{int.class,int.class},width|0x40000000,height|0x40000000);
      call(widget,"layout",new Class<?>[]{int.class,int.class,int.class,int.class},left,top,left+width,top+height);
      call(widget,"setTranslationX",new Class<?>[]{float.class},((Number)call(view,"getTranslationX")).floatValue());
      call(widget,"setTranslationY",new Class<?>[]{float.class},((Number)call(view,"getTranslationY")).floatValue());
      call(widget,"setAlpha",new Class<?>[]{float.class},originalAlpha);
      syncPresentation();
    }
    void findAvatarOwner(Object view) {
      avatarOwner=new WeakReference<Object>(null);
      try{Object current=call(view,"getParent");
        for(int depth=0;current!=null && depth<16;depth++) {
          if(current.getClass().getName().equals("com.discord.chat.presentation.message.MessageView")) {
            Object resources=call(current,"getResources"),context=call(current,"getContext");
            int id=((Number)call(resources,"getIdentifier",new Class<?>[]{String.class,String.class,String.class},"author_avatar","id",String.valueOf(call(context,"getPackageName")))).intValue();
            if(id!=0)avatarOwner=new WeakReference<Object>(call(current,"findViewById",new Class<?>[]{int.class},id));return;
          }
          try{current=call(current,"getParent");}catch(Exception ignored){break;}
        }
      }catch(Exception ignored){}
    }
    boolean visibleThroughParents(Object view) {
      try {
        Object avatar=avatarOwner.get();
        if(avatar!=null && (((Number)call(avatar,"getVisibility")).intValue()!=0 || ((Number)call(avatar,"getAlpha")).floatValue()<=0))return false;
        Class<?> viewType=Class.forName("android.view.View",false,view.getClass().getClassLoader());
        Object current=view;
        for(int depth=0;current!=null && depth<16;depth++) {
          if(!viewType.isInstance(current))break;
          if(((Number)call(current,"getVisibility")).intValue()!=0)return false;
          if(current!=view && ((Number)call(current,"getAlpha")).floatValue()<=0)return false;
          try{current=call(current,"getParent");}catch(Exception ignored){break;}
        }
        return true;
      }catch(Exception ignored){return false;}
    }
    void syncPresentation() throws Exception {
      Object view=source.get();
      boolean visible=!closed && allowed() && view!=null && Boolean.TRUE.equals(call(view,"isAttachedToWindow")) &&
        ((Number)call(view,"getWidth")).intValue()>0 && ((Number)call(view,"getHeight")).intValue()>0 && visibleThroughParents(view);
      call(widget,"setVisibility",new Class<?>[]{int.class},visible?0:8);
      if(visible && loaded)player.resume();else player.pause();
    }
    void observeVisibility(Object view) throws Exception {
      if(observer!=null)return;
      findAvatarOwner(view);observer=call(view,"getViewTreeObserver");
      Class<?> type=Class.forName("android.view.ViewTreeObserver$OnPreDrawListener",false,view.getClass().getClassLoader());
      call(observer,"addOnPreDrawListener",new Class<?>[]{type},preDrawListener);
    }
    void stopObserving() {
      if(observer==null)return;
      try {Class<?> type=Class.forName("android.view.ViewTreeObserver$OnPreDrawListener",false,widget.getClass().getClassLoader());
        call(observer,"removeOnPreDrawListener",new Class<?>[]{type},preDrawListener);
      }catch(Exception ignored){}observer=null;
    }
    void attach() throws Exception {
      Object view=source.get();if(view==null || closed || url==null)return;
      if(!Boolean.TRUE.equals(call(view,"isAttachedToWindow")) || ((Number)call(view,"getVisibility")).intValue()!=0 ||
        ((Number)call(view,"getWidth")).intValue()<=0 || ((Number)call(view,"getHeight")).intValue()<=0)return;
      Object parent=call(view,"getParent");if(parent==null)return;
      Object next=call(parent,"getOverlay");
      if(shown && overlay!=next)detach();
      if(!shown) {
        overlay=next;
        Class<?> viewClass=Class.forName("android.view.View",false,view.getClass().getClassLoader());
        call(overlay,"add",new Class<?>[]{viewClass},widget);shown=true;
        observeVisibility(view);bounds();
        load();
      }else bounds();
      if(loaded){call(view,"setAlpha",new Class<?>[]{float.class},0f);ownsAlpha=true;}
    }
    void setUrl(String next) throws Exception {
      if(!next.equals(url)) {
        detach();url=next;loaded=false;
      }
      attach();
    }
    void detach() throws Exception {
      Object view=source.get();
      if(view!=null && ownsAlpha && ((Number)call(view,"getAlpha")).floatValue()==0)call(view,"setAlpha",new Class<?>[]{float.class},originalAlpha);
      ownsAlpha=false;stopObserving();
      if(shown && overlay!=null) {
        Class<?> vc=Class.forName("android.view.View",false,widget.getClass().getClassLoader());
        call(overlay,"remove",new Class<?>[]{vc},widget);
      }
      shown=false;overlay=null;loaded=false;
      recycle();
    }
    void recycle() throws Exception { player.stop(); }
    void close() {
      closed=true;
      try{detach();}catch(Exception ignored){}
      Object view=source.get();
      if(view!=null)try {
        ClassLoader loader=view.getClass().getClassLoader();
        call(view,"removeOnLayoutChangeListener",new Class<?>[]{Class.forName("android.view.View$OnLayoutChangeListener",false,loader)},layoutListener);
        call(view,"removeOnAttachStateChangeListener",new Class<?>[]{Class.forName("android.view.View$OnAttachStateChangeListener",false,loader)},attachListener);
      }catch(Exception ignored){}
      try{recycle();}catch(Exception ignored){}
    }
  }
  private static void updateDecoration(Object view,String source) { updateDecoration(view,source,true); }
  private static void updateDecoration(Object view,String source,boolean inspectController) {
    WeakReference<Decoration> reference=decorations.get(view);
    Decoration existing=reference==null?null:reference.get();
    if(!allowed() || !isDecoration(source)) {
      if(existing!=null){existing.close();decorations.remove(view);}return;
    }
    if(inspectController && probeImage(view,"decoration-source",source))return;
    if(!decorationState.equals("ready"))return;
    try {
      if(existing==null){existing=new Decoration(view);decorations.put(view,new WeakReference<Decoration>(existing));}
      existing.setUrl(decorationUrl(source));
    }catch(Throwable e){if(existing!=null)existing.close();decorations.remove(view);decorationFailure(e);}
    writeStatus(false);
  }
  private static void bindDecoration(Object messageView,Object message) {
    try {
      String url=null;boolean known=false;
      for(Class<?> c=message.getClass();c!=null && c!=Object.class;c=c.getSuperclass())
        for(Field f:c.getDeclaredFields())if(!Modifier.isStatic(f.getModifiers()) && f.getType()==String.class) {
          if(f.getName().matches("(?i).*(?:content|text|description|accessibility|username).*"))continue;
          if(f.getName().matches("(?i).*avatar.*decoration.*"))known=true;
          f.setAccessible(true);String value=(String)f.get(message);if(isDecoration(value)){url=value;known=true;break;}
        }
      if(!known)return;
      Object ctx=call(messageView,"getContext");
      int id=((Number)call(call(messageView,"getResources"),"getIdentifier",new Class<?>[]{String.class,String.class,String.class},"author_avatar_decoration","id",String.valueOf(call(ctx,"getPackageName")))).intValue();
      if(id!=0){Object view=call(messageView,"findViewById",new Class<?>[]{int.class},id);if(view!=null)updateDecoration(view,url);}
    }catch(Exception e){decorationFailure(e);}
  }
  private static void installChatImageSetters(PluginScope ctx) {
    try {
      Class<?> view=ctx.getClassLoader().loadClass("com.facebook.drawee.view.SimpleDraweeView");
      for(Method setter:view.getDeclaredMethods()) {
        Class<?>[] parameters=setter.getParameterTypes();
        if(Modifier.isStatic(setter.getModifiers()) || setter.getReturnType()!=void.class || parameters.length<1 || parameters.length>2)continue;
        if(parameters[0]!=String.class && !uriType(parameters[0]))continue;
        // String and Uri loading overloads can be renamed by R8. Match their
        // signatures on SimpleDraweeView rather than their original names.
        setter.setAccessible(true);
        hooks.add(XposedBridge.hookMethod(setter,new XC_MethodHook() {
          protected void beforeHookedMethod(MethodHookParam param) {
            if(!allowed() || !chatAvatarView(param.thisObject))return;
            chatSourceSets++;
            if(param.args[0]==null)return;
            String source=param.args[0].toString();
            if(!isAvatar(source))return;
            chatSourceAnimated++;String gif=gifUrl(source);
            if(!source.equals(gif))chatRewrites++;
            try {
              if(param.args[0] instanceof String)param.args[0]=gif;
              else param.args[0]=Class.forName("android.net.Uri").getMethod("parse",String.class).invoke(null,gif);
            }catch(Exception e){errors++;}
          }
          protected void afterHookedMethod(MethodHookParam param) {
            if(param.hasThrowable())return;
            if(decorationView(param.thisObject)) {
              updateDecoration(param.thisObject,param.args[0]==null?null:param.args[0].toString());return;
            }
            if(!allowed() || !chatAvatarView(param.thisObject))return;
            probeImage(param.thisObject,"avatar-source",param.args[0]==null?null:param.args[0].toString());
            try {
              Object controller=viewController(param.thisObject);
              if(controller==null)return;
              if(param.args[0]!=null && isAvatar(param.args[0].toString())) {
                // The source is known here. Do not require controller request
                // fields to remain reachable after setImageURI returns.
                controllers.put(controller,Boolean.TRUE);chatViews++;startAnimation(controller);
              }else controllers.remove(controller);
            }catch(Exception e){errors++;}
            writeStatus(false);
          }
        }));
        chatSetHooks++;
      }
      detail+=";chat-image-setters="+chatSetHooks;
    }catch(Throwable e){detail+=";chat-setter-unavailable="+e.getClass().getSimpleName();}
  }
  private static void installChatHooks(PluginScope ctx) {
    try {
      Class<?> view=ctx.getClassLoader().loadClass("com.discord.chat.presentation.message.MessageView");
      Method bind=null;
      for(Method method:view.getDeclaredMethods())
        if(method.getName().equals("setMessage") && !Modifier.isStatic(method.getModifiers()) && method.getParameterTypes().length>0 && method.getParameterTypes()[0].getName().equals("com.discord.chat.bridge.Message")){bind=method;break;}
      if(bind==null)bind=findMessageBind(call(ctx,"getDexFinder"),view);
      if(bind==null || Modifier.isStatic(bind.getModifiers()) || bind.getParameterTypes().length==0)throw new IllegalStateException("message-bind-not-found");
      bind.setAccessible(true);
      hooks.add(XposedBridge.hookMethod(bind,new XC_MethodHook() {
        protected void beforeHookedMethod(MethodHookParam param) {
          if(!allowed())return;
          chatBinds++;
          try{rewriteMessage(param.args[0]);}catch(Exception e){errors++;}
          writeStatus(false);
        }
        protected void afterHookedMethod(MethodHookParam param) {
          if(!param.hasThrowable()) {
            playChatAvatar(param.thisObject);
            bindDecoration(param.thisObject,param.args[0]);
            probeMessage(param.thisObject,"bind");scheduleProbes(param.thisObject);
          }
        }
      }));
      chatHooks++;
      detail+=";chat-bind="+bind.getName();
    }catch(Throwable e){detail+=";chat-bind-unavailable="+e.getClass().getSimpleName();}
  }
  private static void install(final PluginScope ctx) {
    if (active) return;
    storageDir = ctx.getStorageDir();
    active = true; checked = 0; builds = starts = errors = inspections = requestUris = rewrites = 0;
    chatHooks=chatBinds=chatUrls=chatRewrites=chatViews=chatSetHooks=chatSourceSets=chatSourceAnimated=0;detail="resolving-controller";
    try {
      ClassLoader loader = ctx.getClassLoader();
      Class<?> controllerClass;
      Object finder=null;
      Class<?> canonical=namedClass("com.facebook.drawee.controller.AbstractDraweeController",loader);
      Method attach=namedMethod(canonical,"onAttach");
      if(attach==null) {
        finder=call(ctx,"getDexFinder");
        attach=findByStrings(finder,"Hierarchy cannot be null on attach","AbstractDraweeController#onAttach","controller %x %s: onAttach: %s");
      }
      if(attach==null)throw new IllegalStateException("controller-attach-not-found");
      controllerClass=attach.getDeclaringClass();
      controllerType=controllerClass;
      detail="resolving-animation-getter";
      Method getter=null;
      for(Method method:controllerClass.getDeclaredMethods()) {
        if(method.getParameterTypes().length==0 && method.getReturnType().getName().equals("android.graphics.drawable.Animatable")){getter=method;break;}
      }
      if(getter==null)getter=namedMethod(controllerClass,"getAnimatable");
      if(getter==null)throw new IllegalStateException("native-animation-getter-not-found");
      getter.setAccessible(true);
      animationGetter=getter;
      hooks.add(XposedBridge.hookMethod(getter,new XC_MethodHook() {
        protected void afterHookedMethod(MethodHookParam param) {
          if(!allowed() || param.hasThrowable() || Boolean.TRUE.equals(probing.get()))return;
          WeakReference<ImageProbe> reference=controllerProbes.get(param.thisObject);
          ImageProbe probe=reference==null?null:reference.get();
          if(probe!=null) {
            Object view=probe.view.get();boolean current=false;
            try{current=view!=null && probe.controller.get()==param.thisObject && viewController(view)==param.thisObject;}catch(Exception ignored){}
            if(current)reportImage(probe,param.thisObject,param.getResult(),"controller-result");
            else controllerProbes.remove(param.thisObject);
          }
          else if(controllers.containsKey(param.thisObject) && param.getResult()!=null)
            try{ensureRunning(param.getResult());}catch(Exception error){errors++;}
          writeStatus(false);
        }
      }));
      hooks.add(XposedBridge.hookMethod(attach, new XC_MethodHook() {
        protected void beforeHookedMethod(MethodHookParam param) {
          if(allowed())prepareController(param.thisObject);
        }
        protected void afterHookedMethod(MethodHookParam param) {
          WeakReference<ImageProbe> reference=controllerProbes.get(param.thisObject);
          ImageProbe probe=reference==null?null:reference.get();Object view=probe==null?null:probe.view.get();
          if(view!=null)probeImage(view,"controller-attach",null);
          else if(controllers.containsKey(param.thisObject))startAnimation(param.thisObject);
        }
      }));
      state = "ready";
      detail="controller="+controllerClass.getName()+";request-route=controller-attach;getter="+getter.getName();
      if (ctx.getStartedLate()) ctx.requireReload();
    } catch (Throwable e) {
      errors++; state = "unavailable-" + e.getClass().getSimpleName();
      detail=detail+": "+String.valueOf(e.getMessage());
      for (XC_MethodHook.Unhook hook : hooks) hook.unhook();
      hooks.clear();
      XposedBridge.log("AlwaysAnimate: native avatar hook unavailable: " + e.getClass().getSimpleName());
    }
    decorationCreates=decorationLoads=decorationReady=decorationErrors=decorationFrameCount=0;
    resolveDecorations(ctx);
    installChatHooks(ctx);
    installChatImageSetters(ctx);
    writeStatus(true);
  }
  private static void writeStatus(boolean force) {
    long now = System.currentTimeMillis();
    if (!force && now - written < 1000) return;
    written = now;
    if (storageDir == null) return;
    try {
      storageDir.mkdirs();
      String json = "{\"state\":\""+state+"\",\"detail\":\""+detail.replace("\\","\\\\").replace("\"","\\\"").replace("\n"," ").replace("\r"," ")+"\",\"hooks\":"+hooks.size()+",\"avatarLoads\":"+builds+",\"animationStarts\":"+starts+",\"controllersInspected\":"+inspections+",\"avatarRequestUris\":"+requestUris+",\"nativeGifRewrites\":"+rewrites+",\"chatHooks\":"+chatHooks+",\"chatBinds\":"+chatBinds+",\"chatAvatarUrls\":"+chatUrls+",\"chatGifRewrites\":"+chatRewrites+",\"chatAvatarViews\":"+chatViews+",\"chatImageSetterHooks\":"+chatSetHooks+",\"chatImageLoads\":"+chatSourceSets+",\"chatAnimatedImageLoads\":"+chatSourceAnimated+",\"errors\":"+errors+"}";
      json=json.substring(0,json.length()-1)+",\"decorationState\":\""+decorationState+"\",\"decorationViews\":"+decorationCreates+",\"decorationLoads\":"+decorationLoads+",\"decorationLoaded\":"+decorationReady+",\"decorationErrors\":"+decorationErrors+"}";
      json=json.substring(0,json.length()-1)+",\"decorationDetail\":\""+decorationDetail.replace("\\","\\\\").replace("\"","\\\"").replace("\n"," ").replace("\r"," ")+"\"}";
      json=json.substring(0,json.length()-1)+",\"decorationFrameCount\":"+decorationFrameCount+"}";
      json=json.substring(0,json.length()-1)+",\"chatImageReport\":\""+imageReportText().replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","")+"\"}";
      OutputStream out = new FileOutputStream(new File(storageDir,"native-avatar-status.json"));
      try { out.write(json.getBytes("UTF-8")); } finally { out.close(); }
    } catch (Exception ignored) { /* diagnostics must never interrupt rendering */ }
  }
  private static void closeOnMain(final Decoration item) {
    item.closed=true;
    try {
      Class<?> looper=Class.forName("android.os.Looper");
      Object main=looper.getMethod("getMainLooper").invoke(null);
      if(looper.getMethod("myLooper").invoke(null)!=main) {
        Class<?> handler=Class.forName("android.os.Handler");
        Object dispatcher=handler.getConstructor(looper).newInstance(main);
        if(Boolean.TRUE.equals(call(dispatcher,"post",new Class<?>[]{Runnable.class},new Runnable(){public void run(){item.close();}})))return;
      }
    }catch(Exception ignored){}
    item.close();
  }
  private static void dispose() {
    active = false;
    for (XC_MethodHook.Unhook hook : hooks) hook.unhook();
    hooks.clear();
    synchronized (controllers) {
      for (Map.Entry<Object,Boolean> item : controllers.entrySet()) {
        try {
          Object anim = animatable(item.getKey());
          if (anim != null) call(anim,"stop");
        } catch (Exception ignored) {}
      }
      controllers.clear();
    }
    for(WeakReference<Decoration> reference:new ArrayList<WeakReference<Decoration>>(decorations.values())) {
      Decoration item=reference.get();if(item!=null)closeOnMain(item);
    }
    decorations.clear();
    BundledFramePlayer.clearCache();
    decorationState="stopped";
    for(Map.Entry<Object,ProbeTask> item:new ArrayList<Map.Entry<Object,ProbeTask>>(probeTasks.entrySet()))
      try{call(item.getKey(),"removeCallbacks",new Class<?>[]{Runnable.class},item.getValue());}catch(Exception ignored){}
    probeTasks.clear();imageProbes.clear();controllerProbes.clear();imageReport.clear();
    messageFields.clear();
    synchronized(requestFields){requestFields.clear();}
    synchronized(controllerGetters){controllerGetters.clear();}
    animationGetter=null;
    state = "stopped"; writeStatus(true);
  }
}
