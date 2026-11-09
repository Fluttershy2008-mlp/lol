/* SPDX-License-Identifier: GPL-3.0-or-later */
package dev.fluttershy.alwaysanimate;
import java.io.*;
import java.net.*;
import java.lang.reflect.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Uses only Android framework APIs. No Discord APNG classes or native libraries. */
public final class BundledFramePlayer {
  public interface Events {void loaded(String url);void failed(Throwable error);}
  private static final LinkedHashMap<String,Cached> cache=new LinkedHashMap<String,Cached>(16,.75f,true);
  private static long cacheBytes;
  private static final ThreadPoolExecutor workers=new ThreadPoolExecutor(2,2,30,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(32),new ThreadFactory(){public Thread newThread(Runnable task){Thread t=new Thread(task,"AlwaysAnimate-PNG");t.setDaemon(true);return t;}});
  static {workers.allowCoreThreadTimeOut(true);}
  private static final class Cached {final Object state;final long bytes;final int frames;Cached(Object s,long b,int n){state=s;bytes=b;frames=n;}}
  public final Object view;
  public int frameCount;
  private final Object resources,handler;
  private final Events events;
  private final File storage;
  private volatile int generation;
  private Future<?> future;
  private Object animation;
  private static Class<?> cls(String name)throws Exception{return Class.forName(name);}
  private static Object call(Object object,String name,Class<?>[] types,Object... args)throws Exception {Method method=object.getClass().getMethod(name,types);method.setAccessible(true);return method.invoke(object,args);}
  private static Object call(Object object,String name)throws Exception{return call(object,name,new Class<?>[0]);}
  public static void checkAvailable()throws Exception {
    cls("android.graphics.drawable.AnimationDrawable").getConstructor();
    cls("android.widget.ImageView").getConstructor(cls("android.content.Context"));
    cls("android.graphics.BitmapFactory").getMethod("decodeByteArray",byte[].class,int.class,int.class);
  }
  public BundledFramePlayer(Object context,Object res,File directory,Events listener)throws Exception {
    resources=res;storage=directory;events=listener;
    view=cls("android.widget.ImageView").getConstructor(cls("android.content.Context")).newInstance(context);
    Object main=cls("android.os.Looper").getMethod("getMainLooper").invoke(null);
    handler=cls("android.os.Handler").getConstructor(cls("android.os.Looper")).newInstance(main);
  }
  private void post(Runnable task)throws Exception {
    if(!Boolean.TRUE.equals(call(handler,"post",new Class<?>[]{Runnable.class},task)))throw new IOException("Android UI dispatch failed");
  }
  public void load(final String url)throws Exception {
    stop();final int token=generation;
    final int target=Math.max(32,Math.min(192,((Number)call(view,"getWidth")).intValue()));
    try{future=workers.submit(new Runnable(){public void run(){
      try {
        final Cached cached=asset(url,target,storage);
        if(token!=generation)return;
        post(new Runnable(){public void run(){
          if(token!=generation)return;
          try {
            animation=cls("android.graphics.drawable.Drawable$ConstantState").getMethod("newDrawable",cls("android.content.res.Resources")).invoke(cached.state,resources);
            call(animation,"mutate");call(view,"setImageDrawable",new Class<?>[]{cls("android.graphics.drawable.Drawable")},animation);
            call(animation,"start");frameCount=cached.frames;events.loaded(url);
          }catch(Throwable error){events.failed(error);}
        }});
      }catch(final Throwable error){
        if(token!=generation)return;
        try{post(new Runnable(){public void run(){if(token==generation)events.failed(error);}});}catch(Exception ignored){}
      }
    }});}catch(RejectedExecutionException error){events.failed(new IOException("frame loading queue is busy"));}
  }
  public void pause()throws Exception {
    if(animation==null)return;
    try{if(Boolean.FALSE.equals(call(animation,"isRunning")))return;}catch(NoSuchMethodException ignored){}
    call(animation,"stop");
  }
  public void resume()throws Exception {
    if(animation==null)return;
    try{if(Boolean.TRUE.equals(call(animation,"isRunning")))return;}catch(NoSuchMethodException ignored){}
    call(animation,"start");
  }
  public void stop()throws Exception {
    generation++;if(future!=null){future.cancel(false);future=null;workers.purge();}
    if(animation!=null){call(animation,"stop");animation=null;}
    call(view,"setImageDrawable",new Class<?>[]{cls("android.graphics.drawable.Drawable")},(Object)null);
  }
  public static void clearCache(){synchronized(cache){cache.clear();cacheBytes=0;}}
  private static Cached asset(String url,int target,File storage)throws Exception {
    String key=url+":"+target;
    synchronized(cache){Cached item=cache.get(key);if(item!=null)return item;}
    byte[] bytes=download(url,storage);
    ApngFrames.Result frames=ApngFrames.decode(bytes,target,new AndroidPixels());
    Object animation=cls("android.graphics.drawable.AnimationDrawable").getConstructor().newInstance();
    call(animation,"setOneShot",new Class<?>[]{boolean.class},false);
    try {
      Class<?> bitmap=cls("android.graphics.Bitmap"),drawable=cls("android.graphics.drawable.Drawable");
      Constructor<?> constructor=cls("android.graphics.drawable.BitmapDrawable").getConstructor(cls("android.content.res.Resources"),bitmap);
      for(int i=0;i<frames.images.size();i++) {
        Object child=constructor.newInstance(null,frames.images.get(i));
        call(animation,"addFrame",new Class<?>[]{drawable,int.class},child,frames.delays.get(i));
      }
      Object state=call(animation,"getConstantState");if(state==null)throw new IOException("Android animation state missing");
      Cached item=new Cached(state,frames.bytes(),frames.images.size());
      synchronized(cache) {
        Cached prior=cache.get(key);if(prior!=null)return prior;
        cache.put(key,item);cacheBytes+=item.bytes;
        Iterator<Cached> iterator=cache.values().iterator();
        while(cacheBytes>16*1024*1024 && iterator.hasNext()){cacheBytes-=iterator.next().bytes;iterator.remove();}
      }
      return item;
    }catch(Exception error){for(Object image:frames.images)new AndroidPixels().release(image);throw error;}
  }
  private static byte[] download(String source,File storage)throws Exception {
    if(!AlwaysAnimateNative.isDecoration(source) || !source.equals(AlwaysAnimateNative.decorationUrl(source)))
      throw new IOException("not an animated Discord decoration URL");
    File directory=new File(storage,"frame-cache");directory.mkdirs();
    byte[] digest=MessageDigest.getInstance("SHA-256").digest(source.getBytes("UTF-8"));StringBuilder name=new StringBuilder();for(byte b:digest)name.append(String.format("%02x",b&255));
    File file=new File(directory,name.toString()+".png");
    if(file.isFile() && file.length()>0 && file.length()<=8*1024*1024) {
      InputStream in=new FileInputStream(file);try{return read(in);}finally{in.close();}
    }
    HttpURLConnection connection=(HttpURLConnection)new URL(source).openConnection();
    connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);
    byte[] result;
    try {
      if(connection.getResponseCode()!=200)throw new IOException("decoration CDN HTTP "+connection.getResponseCode());
      InputStream in=connection.getInputStream();try{result=read(in);}finally{in.close();}
    }finally{connection.disconnect();}
    File temp=File.createTempFile("frame-",".tmp",directory);
    try{OutputStream out=new FileOutputStream(temp);try{out.write(result);}finally{out.close();}if(!temp.renameTo(file))temp.delete();}finally{temp.delete();}
    File[] files=directory.listFiles();if(files!=null) {
      Arrays.sort(files,new Comparator<File>(){public int compare(File a,File b){return Long.compare(a.lastModified(),b.lastModified());}});
      long total=0;for(File f:files)total+=f.length();for(File f:files){if(total<=32*1024*1024)break;long size=f.length();if(f.delete())total-=size;}
    }
    return result;
  }
  private static byte[] read(InputStream in)throws Exception {
    ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
    while((count=in.read(buffer))!=-1){if(out.size()+count>8*1024*1024)throw new IOException("PNG asset exceeds 8 MiB");out.write(buffer,0,count);}return out.toByteArray();
  }
  private static final class AndroidPixels implements ApngFrames.Pixels {
    final Class<?> bitmap,config,canvas,paint;
    final Object argb;
    AndroidPixels()throws Exception{bitmap=cls("android.graphics.Bitmap");config=cls("android.graphics.Bitmap$Config");canvas=cls("android.graphics.Canvas");paint=cls("android.graphics.Paint");argb=config.getField("ARGB_8888").get(null);}
    public Object empty(int w,int h)throws Exception{return bitmap.getMethod("createBitmap",int.class,int.class,config).invoke(null,w,h,argb);}
    public Object decode(byte[] png)throws Exception{return cls("android.graphics.BitmapFactory").getMethod("decodeByteArray",byte[].class,int.class,int.class).invoke(null,png,0,png.length);}
    public Object copy(Object image)throws Exception{return call(image,"copy",new Class<?>[]{config,boolean.class},argb,true);}
    public Object snapshot(Object image,int w,int h)throws Exception {
      Object scaled=bitmap.getMethod("createScaledBitmap",bitmap,int.class,int.class,boolean.class).invoke(null,image,w,h,true);
      return scaled==image?copy(image):scaled;
    }
    public void clear(Object image,int x,int y,int w,int h)throws Exception {
      Object c=canvas.getConstructor(bitmap).newInstance(image),p=paint.getConstructor().newInstance();
      Class<?> mode=cls("android.graphics.PorterDuff$Mode");Object clear=mode.getField("CLEAR").get(null);
      Object transfer=cls("android.graphics.PorterDuffXfermode").getConstructor(mode).newInstance(clear);
      call(p,"setXfermode",new Class<?>[]{cls("android.graphics.Xfermode")},transfer);
      call(c,"drawRect",new Class<?>[]{float.class,float.class,float.class,float.class,paint},(float)x,(float)y,(float)(x+w),(float)(y+h),p);
    }
    public void draw(Object target,Object image,int x,int y)throws Exception {
      Object c=canvas.getConstructor(bitmap).newInstance(target);call(c,"drawBitmap",new Class<?>[]{bitmap,float.class,float.class,paint},image,(float)x,(float)y,null);
    }
    public void release(Object image){try{call(image,"recycle");}catch(Exception ignored){}}
  }
}
