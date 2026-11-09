package de.robv.android.xposed;
import java.lang.reflect.Member;
public class XposedBridge {
 public static final java.util.Map<Member,XC_MethodHook> hooks = new java.util.HashMap<Member,XC_MethodHook>();
 public static XC_MethodHook.Unhook hookMethod(final Member m, XC_MethodHook h){hooks.put(m,h);return h.new Unhook(){public void unhook(){hooks.remove(m);}};}
 public static Object invoke(Object target, String name, Object... args) throws Throwable {
  java.lang.reflect.Method m=null;
  for(java.lang.reflect.Method candidate:target.getClass().getMethods())if(candidate.getName().equals(name)&&candidate.getParameterTypes().length==args.length){m=candidate;break;}
  if(m==null)throw new NoSuchMethodException(name);
  XC_MethodHook h=hooks.get(m);
  XC_MethodHook.MethodHookParam p=new XC_MethodHook.MethodHookParam(); p.thisObject=target; p.args=args;
  if(h!=null)h.beforeHookedMethod(p);
  try{p.result=m.invoke(target,p.args);}catch(java.lang.reflect.InvocationTargetException e){p.throwable=e.getCause();}
  if(h!=null)h.afterHookedMethod(p);
  if(p.throwable!=null)throw p.throwable;
  return p.result;
 }
 public static void log(String message){System.out.println(message);}
}
