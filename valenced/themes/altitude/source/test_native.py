"""Compile against host ABI stubs and exercise avatar lifecycle on the JVM.

The stubs are test fixtures only. They are NEVER included in plugin.jar.
For a platform build the same Java source can be compiled in the official
Valenced plugin template with app.valenced:api and Android compileOnly.
"""
from pathlib import Path
import subprocess
import shutil
import os
import tempfile
import atexit
import textwrap

ROOT = Path(__file__).resolve().parent.parent
BUILD = Path(tempfile.mkdtemp(prefix='altitude-native-'))
atexit.register(shutil.rmtree, BUILD, ignore_errors=True)
STUBS = BUILD / 'stubs'
CLASSES = BUILD / 'classes'
STUB_CLASSES = BUILD / 'stub-classes'

SOURCES = {
'kotlin/Unit.java': '''
package kotlin; public final class Unit { public static final Unit INSTANCE=new Unit(); }
''',
'kotlin/jvm/functions/Function1.java': '''
package kotlin.jvm.functions; public interface Function1<P,R> { R invoke(P p); }
''',
'android/util/DisplayMetrics.java': '''
package android.util; public class DisplayMetrics { public float density=3; public float scaledDensity=3.6f; }
''',
'android/content/res/Resources.java': '''
package android.content.res;
import android.util.DisplayMetrics;
public class Resources {
 public static class NotFoundException extends RuntimeException {}
 public DisplayMetrics getDisplayMetrics(){return new DisplayMetrics();}
 public String getResourceEntryName(int id){
  switch(id){case 1:return "author_avatar";case 2:return "author_name";case 3:return "timestamp";default:return "attachment";}
 }
 public int getIdentifier(String n,String t,String p){return n.equals("author_avatar")?1:n.equals("author_name")?2:n.equals("timestamp")?3:0;}
}
''',
'android/content/Context.java': '''
package android.content;
import android.content.res.Resources;
public class Context { public Resources getResources(){return new Resources();} public String getPackageName(){return "com.discord";} }
''',
'android/graphics/Outline.java': '''
package android.graphics;
public class Outline { public float radius; public int width,height;
 public void setRoundRect(int l,int t,int r,int b,float radius){this.width=r-l;this.height=b-t;this.radius=radius;}
}
''',
'android/graphics/Typeface.java': '''
package android.graphics; import java.io.File;
public class Typeface { public static Typeface createFromFile(File f){if(!f.isFile())throw new IllegalArgumentException();return new Typeface();} }
''',
'android/os/Looper.java': '''
package android.os; public class Looper { public static Looper getMainLooper(){return new Looper();} }
''',
'android/os/Handler.java': '''
package android.os; public class Handler { public Handler(Looper l){} public boolean post(Runnable r){r.run();return true;} }
''',
'android/view/ViewOutlineProvider.java': '''
package android.view; import android.graphics.Outline;
public abstract class ViewOutlineProvider { public abstract void getOutline(View view,Outline outline); }
''',
'android/view/View.java': '''
package android.view;
import android.content.Context;import android.content.res.Resources;
import de.robv.android.xposed.*;
public class View {
 private int id=0; private ViewOutlineProvider outline; private boolean clip;
 public View(){} public void setId(int i){id=i;} public int getId(){return id;}
 public int getWidth(){return 120;}public int getHeight(){return 120;}
 public Context getContext(){return new Context();}public Resources getResources(){return getContext().getResources();}
 public View findViewById(int id){return this.id==id?this:null;}
 public ViewOutlineProvider getOutlineProvider(){return outline;}
 public void setOutlineProvider(ViewOutlineProvider v){
  XC_MethodHook.MethodHookParam p=XposedBridge.before(View.class,"setOutlineProvider",new Class[]{ViewOutlineProvider.class},this,new Object[]{v});
  outline=(ViewOutlineProvider)p.args[0];XposedBridge.after(p);
 }
 public boolean getClipToOutline(){return clip;}
 public void setClipToOutline(boolean b){
  XC_MethodHook.MethodHookParam p=XposedBridge.before(View.class,"setClipToOutline",new Class[]{Boolean.TYPE},this,new Object[]{b});
  clip=(Boolean)p.args[0];XposedBridge.after(p);
 }
 public void invalidateOutline(){}
}
''',
'android/view/ViewGroup.java': '''
package android.view;public class ViewGroup extends View{}
''',
'android/widget/TextView.java': '''
package android.widget;
import android.view.View;import android.graphics.Typeface;
public class TextView extends View {
 private Typeface face;private float size=48,extra=0,multiplier=1.05f;
 public Typeface getTypeface(){return face;}public void setTypeface(Typeface t){face=t;}
 public float getTextSize(){return size;}public void setTextSize(int unit,float s){size=unit==2?s*getResources().getDisplayMetrics().scaledDensity:s;}
 public float getLineSpacingExtra(){return extra;}public float getLineSpacingMultiplier(){return multiplier;}
 public void setLineSpacing(float e,float m){extra=e;multiplier=m;}
}
''',
'app/valenced/xposed/api/HostScope.java': '''
package app.valenced.xposed.api;import app.valenced.bridge.ValencedBridge;
public interface HostScope {ClassLoader getClassLoader();ValencedBridge getBridge();}
''',
'app/valenced/plugins/PluginScope.java': '''
package app.valenced.plugins;
import java.io.File;import app.valenced.xposed.api.HostScope;
public interface PluginScope extends HostScope {File getPluginDir();boolean getStartedLate();void requireReload();}
''',
'app/valenced/plugins/PluginBuilder.java': '''
package app.valenced.plugins;import kotlin.Unit;import kotlin.jvm.functions.Function1;
public class PluginBuilder {
 public Function1<PluginScope,Unit> onStart,onStop;
 public void start(Function1<PluginScope,Unit> f){onStart=f;}
 public void stop(Function1<PluginScope,Unit> f){onStop=f;}
}
''',
'app/valenced/bridge/ValencedBridge.java': '''
package app.valenced.bridge;import java.util.List;import kotlin.jvm.functions.Function1;
public interface ValencedBridge {void registerMethod(String n,Function1<List<?>,Object> f);}
''',
'de/robv/android/xposed/XC_MethodHook.java': '''
package de.robv.android.xposed;import java.lang.reflect.Member;
public abstract class XC_MethodHook {
 protected void beforeHookedMethod(MethodHookParam p)throws Throwable{}
 protected void afterHookedMethod(MethodHookParam p)throws Throwable{}
 public static class MethodHookParam {public Object thisObject;public Object[] args;public Member method;public boolean hasThrowable(){return false;}}
 public class Unhook {private Member method;public Unhook(Member m){method=m;}public void unhook(){XposedBridge.remove(method,XC_MethodHook.this);}}
}
''',
'de/robv/android/xposed/XposedBridge.java': '''
package de.robv.android.xposed;
import java.lang.reflect.*;import java.util.*;
public final class XposedBridge {
 private static final Map<Member,List<XC_MethodHook>> hooks=new HashMap<Member,List<XC_MethodHook>>();
 public static XC_MethodHook.Unhook hookMethod(Member m,XC_MethodHook h){
  if(!hooks.containsKey(m))hooks.put(m,new ArrayList<XC_MethodHook>());hooks.get(m).add(h);return h.new Unhook(m);
 }
 public static Set<XC_MethodHook.Unhook> hookAllConstructors(Class<?> c,XC_MethodHook h){
  Set<XC_MethodHook.Unhook> r=new HashSet<XC_MethodHook.Unhook>();for(Constructor<?> m:c.getDeclaredConstructors())r.add(hookMethod(m,h));return r;
 }
 static void remove(Member m,XC_MethodHook h){if(hooks.containsKey(m))hooks.get(m).remove(h);}
 public static XC_MethodHook.MethodHookParam before(Class<?> c,String n,Class<?>[] types,Object self,Object[] args){
  try{Method m=c.getDeclaredMethod(n,types);XC_MethodHook.MethodHookParam p=new XC_MethodHook.MethodHookParam();p.method=m;p.thisObject=self;p.args=args;
   if(hooks.containsKey(m))for(XC_MethodHook h:new ArrayList<XC_MethodHook>(hooks.get(m)))h.beforeHookedMethod(p);return p;
  }catch(Throwable e){throw new RuntimeException(e);}
 }
 public static void after(XC_MethodHook.MethodHookParam p){try{if(hooks.containsKey(p.method))for(XC_MethodHook h:new ArrayList<XC_MethodHook>(hooks.get(p.method)))h.afterHookedMethod(p);}catch(Throwable e){throw new RuntimeException(e);}}
 public static void log(String s){System.err.println(s);}
}
''',
'com/facebook/drawee/view/SimpleDraweeView.java': '''
package com.facebook.drawee.view;
import android.view.View;import de.robv.android.xposed.*;
public class SimpleDraweeView extends View {
 public void setImageURI(String uri){XC_MethodHook.MethodHookParam p=XposedBridge.before(SimpleDraweeView.class,"setImageURI",new Class[]{String.class},this,new Object[]{uri});XposedBridge.after(p);}
}
''',
'com/discord/chat/bridge/Message.java': '''
package com.discord.chat.bridge;public class Message {}
''',
'com/discord/clip/ClipView.java': '''
package com.discord.clip;
import android.view.View;import de.robv.android.xposed.*;
public class ClipView extends View {
 private float clipPathRadius=0;public boolean circle;
 public void clipToCircle(boolean b){
  XC_MethodHook.MethodHookParam p=XposedBridge.before(ClipView.class,"clipToCircle",new Class[]{Boolean.TYPE},this,new Object[]{b});
  circle=(Boolean)p.args[0];XposedBridge.after(p);
 }
 public void clipToBorderRadius(float r){
  XC_MethodHook.MethodHookParam p=XposedBridge.before(ClipView.class,"clipToBorderRadius",new Class[]{Float.TYPE},this,new Object[]{r});
  clipPathRadius=((Number)p.args[0]).floatValue();XposedBridge.after(p);
 }
 public float radius(){return clipPathRadius;}
}
''',
'com/discord/chat/presentation/message/MessageView.java': '''
package com.discord.chat.presentation.message;
import android.view.*;import android.widget.TextView;import com.facebook.drawee.view.SimpleDraweeView;import de.robv.android.xposed.*;
public class MessageView extends ViewGroup {
 public final SimpleDraweeView avatar=new SimpleDraweeView();public final TextView name=new TextView(),time=new TextView();
 public MessageView(){avatar.setId(1);name.setId(2);time.setId(3);}
 public View findViewById(int id){return id==1?avatar:id==2?name:id==3?time:null;}
 public void setMessage(com.discord.chat.bridge.Message m){XC_MethodHook.MethodHookParam p=XposedBridge.before(MessageView.class,"setMessage",new Class[]{com.discord.chat.bridge.Message.class},this,new Object[]{m});XposedBridge.after(p);}
}
''',
'com/discord/chat/presentation/message/view/MessageContentView.java': '''
package com.discord.chat.presentation.message.view;
import android.widget.TextView;import de.robv.android.xposed.*;
public class MessageContentView extends TextView {
 public void setMessageContent(String t){XC_MethodHook.MethodHookParam p=XposedBridge.before(MessageContentView.class,"setMessageContent",new Class[]{String.class},this,new Object[]{t});XposedBridge.after(p);}
}
''',
}

TEST = '''
import dev.fluttershy2008.altitude.Altitude;
import app.valenced.plugins.*;import app.valenced.bridge.*;
import kotlin.jvm.functions.Function1;import java.io.File;import java.util.*;
import android.view.*;import android.graphics.*;
import com.facebook.drawee.view.SimpleDraweeView;
import com.discord.chat.presentation.message.MessageView;
import com.discord.chat.presentation.message.view.MessageContentView;
public class NativeTest {
 static void check(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] args){
  final Map<String,Function1<List<?>,Object>> methods=new HashMap<String,Function1<List<?>,Object>>();
  PluginScope scope=new PluginScope(){
   public File getPluginDir(){return new File(args[0]);}
   public boolean getStartedLate(){return false;}public void requireReload(){}
   public ClassLoader getClassLoader(){return NativeTest.class.getClassLoader();}
   public ValencedBridge getBridge(){return new ValencedBridge(){public void registerMethod(String n,Function1<List<?>,Object> f){methods.put(n,f);}};}
  };
  Altitude.altitude.onStart.invoke(scope);
  com.discord.clip.ClipView profile=new com.discord.clip.ClipView();profile.clipToBorderRadius(24);profile.clipToCircle(true);
  check(!profile.circle&&profile.radius()==9,"profile masks must be square in addition to their images");
  profile.clipToBorderRadius(36);
  check(profile.radius()==9,"later mask updates must retain square corners");
  com.discord.clip.ClipView regularMask=new com.discord.clip.ClipView();regularMask.clipToBorderRadius(24);
  check(regularMask.radius()==24,"rectangular attachment masks must remain unchanged");
  com.discord.clip.ClipView recycledMask=new com.discord.clip.ClipView();recycledMask.clipToBorderRadius(22);recycledMask.clipToCircle(true);recycledMask.clipToCircle(false);
  check(!recycledMask.circle&&recycledMask.radius()==22,"recycled circular mask must restore the intended rectangle radius");
  ViewOutlineProvider circle=new ViewOutlineProvider(){public void getOutline(View v,Outline o){o.setRoundRect(0,0,v.getWidth(),v.getHeight(),60);}};
  SimpleDraweeView avatar=new SimpleDraweeView();avatar.setId(1);avatar.setOutlineProvider(circle);avatar.setClipToOutline(true);
  Outline outline=new Outline();avatar.getOutlineProvider().getOutline(avatar,outline);
  check(outline.radius==9f,"3dp radius must respect density");
  check(outline.width==120&&outline.height==120,"square must retain complete image bounds");
  SimpleDraweeView attachment=new SimpleDraweeView();attachment.setOutlineProvider(circle);attachment.setClipToOutline(true);
  attachment.setImageURI("https://cdn.discordapp.com/attachments/x/y/image.png");
  check(attachment.getOutlineProvider()==circle,"ordinary attachments must keep their clipping");
  SimpleDraweeView recycled=new SimpleDraweeView();recycled.setOutlineProvider(circle);recycled.setClipToOutline(true);
  recycled.setImageURI("https://cdn.discordapp.com/avatars/123/a_abc.gif?size=128");
  check(recycled.getOutlineProvider()!=circle,"animated avatar must become square without changing its URI");
  recycled.setImageURI("https://cdn.discordapp.com/attachments/x/y/image.png");
  check(recycled.getOutlineProvider()==circle&&recycled.getClipToOutline(),"recycled image must restore previous clipping");
  check(!Altitude.isAvatarUri("https://cdn.discordapp.com/avatar-decoration-presets/a.png"),"decorations must stay untouched");
  check(Altitude.isAvatarUri("https://cdn.discordapp.com/embed/avatars/0.png"),"default avatars must be square too");
  MessageView message=new MessageView();message.setMessage(new com.discord.chat.bridge.Message());
  check(message.name.getTypeface()!=null,"native message header must use bundled Lexend");
  check(Math.abs(message.name.getTextSize()-57.6f)<0.01f,"message names must respect system font scale");
  check(Math.abs(message.time.getTextSize()-43.2f)<0.01f,"timestamp must use 12sp");
  MessageContentView body=new MessageContentView();float originalSize=body.getTextSize();body.setMessageContent("hi");
  check(Math.abs(body.getLineSpacingMultiplier()-1.2f)<0.001f,"body line spacing must match the port");
  Map status=(Map)methods.get("dev.fluttershy2008.altitude-theme.status").invoke(Collections.emptyList());
  check(Boolean.TRUE.equals(status.get("active"))&&Boolean.TRUE.equals(status.get("fontLoaded")),"native status must report real state");
  Altitude.altitude.onStop.invoke(scope);
  check(profile.circle&&profile.radius()==36,"disable must restore circle masks and the latest requested radius");
  check(avatar.getOutlineProvider()==circle&&avatar.getClipToOutline(),"disable must restore the intended circle provider and clipping");
  check(body.getTypeface()==null&&body.getTextSize()==originalSize,"disable must restore original typography");
  avatar.setOutlineProvider(circle);Outline restored=new Outline();avatar.getOutlineProvider().getOutline(avatar,restored);
  check(restored.radius==60,"framework hooks must be removed on disable");
  Altitude.altitude.onStart.invoke(scope);Altitude.altitude.onStop.invoke(scope);
  System.out.println("Native lifecycle tests passed (shape, density, recycling, fonts, scaling, cleanup and re-enable)");
 }
}
'''

for name, content in SOURCES.items():
    path = STUBS / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content))
STUB_CLASSES.mkdir(parents=True, exist_ok=True)
CLASSES.mkdir(parents=True, exist_ok=True)
javac = ['javac'] if shutil.which('javac') else ['java', 'com.sun.tools.javac.Main']
subprocess.run([*javac, '--release', '7', '-Xlint:-options', '-d', str(STUB_CLASSES),
                *map(str, STUBS.rglob('*.java'))], check=True)
subprocess.run([*javac, '--release', '7', '-Xlint:-options', '-cp', str(STUB_CLASSES), '-d', str(CLASSES),
                *map(str, (ROOT/'source/native').rglob('*.java'))], check=True)
test_file = BUILD / 'NativeTest.java'
test_file.write_text(TEST)
subprocess.run([*javac, '--release', '8', '-cp', f'{STUB_CLASSES}:{CLASSES}', '-d', str(STUB_CLASSES), str(test_file)], check=True)
subprocess.run(['java', '-cp', f'{STUB_CLASSES}:{CLASSES}', 'NativeTest', str(ROOT)], check=True)

# dx 1.7 predates the Java 7 classfile version, though this source uses only
# Java 6 instructions. Lower the version header, without altering code.
for path in CLASSES.rglob('*.class'):
    data = bytearray(path.read_bytes())
    assert data[:4] == b'\xca\xfe\xba\xbe'
    data[6:8] = (50).to_bytes(2, 'big')
    path.write_bytes(data)
compiler = Path(os.environ.get('ALTITUDE_DEX_COMPILER', '/nonexistent/dx.jar'))
if compiler.is_file():
    subprocess.run(['java', '-jar', str(compiler), '--dex', '--output=' + str(ROOT/'plugin.jar'), str(CLASSES)], check=True)
    print('Built plugin.jar (only Altitude classes; no Android, Kotlin or Valenced stubs)')
else:
    print('JVM compilation passed. Supply dx.jar or use the official Valenced template to produce plugin.jar.')
