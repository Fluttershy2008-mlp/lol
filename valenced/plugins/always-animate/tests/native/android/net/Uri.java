package android.net;
public class Uri {private final String text;public Uri(String value){text=value;}public static Uri parse(String value){return new Uri(value);}public String toString(){return text;}}
