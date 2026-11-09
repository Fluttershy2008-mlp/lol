package renamed;
import android.graphics.drawable.Animatable;
public class a {
 public Object request;
 public boolean loaded;
 public final d z=new d();
 public Animatable x(){return loaded?z:null;}
 public void y(){}
 public void w(){loaded=true;}
 public static class d implements Animatable {public int starts,stops;public void start(){starts++;}public void stop(){stops++;}public boolean isRunning(){return starts>stops;}}
}
