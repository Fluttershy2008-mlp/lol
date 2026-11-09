package org.luckypray.dexkit.query.matchers;
public class MethodMatcher {
 public String marker;public String[] markers;public Class<?>[] parameters;public Class<?> returns;public int flags;
 public MethodMatcher usingEqStrings(String... values){marker=values[0];markers=values;return this;}
 public MethodMatcher paramTypes(Class<?>... types){parameters=types;return this;}
 public MethodMatcher returnType(Class<?> type){returns=type;return this;}
 public MethodMatcher modifiers(int flags){this.flags=flags;return this;}
}
