package com.discord.chat.bridge;
public class Message {
 public final String avatarURL;
 public final String content;
 public String avatarDecorationURL;
 public final Payload payload;
 public Message(String url,String content){this(url,content,false);}
 public Message(String url,String content,boolean opaque){this.avatarURL=opaque?null:url;this.payload=new Payload(url);this.content=content;}
 public String loadedAvatar(){return avatarURL==null?payload.uri:avatarURL;}
 public static class Payload {public final String uri;public Payload(String uri){this.uri=uri;}}
}
