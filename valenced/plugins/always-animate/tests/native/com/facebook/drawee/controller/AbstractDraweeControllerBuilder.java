package com.facebook.drawee.controller;
public class AbstractDraweeControllerBuilder {
 public boolean autoplay; public final Request request;
 public AbstractDraweeControllerBuilder(String uri){request=new Request(uri);}
 public Request getImageRequest(){return request;}
 public AbstractDraweeControllerBuilder setAutoPlayAnimations(boolean enabled){autoplay=enabled;return this;}
 public AbstractDraweeController build(){return new AbstractDraweeController(request);}
 public static class Request {private final android.net.Uri uri; public Request(String uri){this.uri=android.net.Uri.parse(uri);} public String getSourceUri(){return uri.toString();}}
}
