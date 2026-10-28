// SPDX-License-Identifier: MIT
// Generated from Discord's pinned WebView fork; see vendor/discord-webview/README.md and LICENSE.
export function createPackagedWebView(React, RN, bridge, nativeModule, NativeView, Commands, prefix) {
    const external = {
        react: React, 'react-native': RN,
        'react-native/Libraries/BatchedBridge/BatchedBridge': bridge,
        './NativeRNCWebView': { __esModule: true, default: nativeModule },
        './RNCWebViewNativeComponent': { __esModule: true, default: NativeView, Commands },
        invariant(value, message) { if (!value) throw new Error(message); },
        'escape-string-regexp': value => String(value).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'),
    };
    const factories = { "./WebView.android": function(module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var WebView_android_exports = {};
__export(WebView_android_exports, {
  default: () => WebView_android_default
});
module.exports = __toCommonJS(WebView_android_exports);
var import_react = __toESM(require("react"));
var import_react_native = require("react-native");
var import_BatchedBridge = __toESM(require("react-native/Libraries/BatchedBridge/BatchedBridge"));
var import_invariant = __toESM(require("invariant"));
var import_RNCWebViewNativeComponent = __toESM(require("./RNCWebViewNativeComponent"));
var import_NativeRNCWebView = __toESM(require("./NativeRNCWebView"));
var import_WebViewShared = require("./WebViewShared");
var import_WebView = __toESM(require("./WebView.styles"));
const { resolveAssetSource } = import_react_native.Image;
let uniqueRef = 0;
const WebViewComponent = (0, import_react.forwardRef)(({
  overScrollMode = "always",
  javaScriptEnabled = true,
  thirdPartyCookiesEnabled = true,
  scalesPageToFit = true,
  allowsFullscreenVideo = false,
  allowFileAccess = false,
  saveFormDataDisabled = false,
  cacheEnabled = true,
  androidLayerType = "none",
  originWhitelist = import_WebViewShared.defaultOriginWhitelist,
  setSupportMultipleWindows = true,
  setBuiltInZoomControls = true,
  setDisplayZoomControls = false,
  nestedScrollEnabled = false,
  startInLoadingState,
  onNavigationStateChange,
  onLoadStart,
  onError,
  onLoad,
  onLoadEnd,
  onLoadProgress,
  onHttpError: onHttpErrorProp,
  onRenderProcessGone: onRenderProcessGoneProp,
  onMessage: onMessageProp,
  onOpenWindow: onOpenWindowProp,
  renderLoading,
  renderError,
  style,
  containerStyle,
  source,
  nativeConfig,
  onShouldStartLoadWithRequest: onShouldStartLoadWithRequestProp,
  injectedJavaScriptObject,
  ...otherProps
}, ref) => {
  const messagingModuleName = (0, import_react.useRef)(`${prefix}${uniqueRef += 1}`).current;
  const webViewRef = (0, import_react.useRef)(null);
  const onShouldStartLoadWithRequestCallback = (0, import_react.useCallback)((shouldStart, url, lockIdentifier) => {
    if (lockIdentifier) {
      import_NativeRNCWebView.default.shouldStartLoadWithLockIdentifier(shouldStart, lockIdentifier);
    } else if (shouldStart && webViewRef.current) {
      import_RNCWebViewNativeComponent.Commands.loadUrl(webViewRef.current, url);
    }
  }, []);
  const { onLoadingStart, onShouldStartLoadWithRequest, onMessage, viewState, setViewState, lastErrorEvent, onHttpError, onLoadingError, onLoadingFinish, onLoadingProgress, onOpenWindow, onRenderProcessGone } = (0, import_WebViewShared.useWebViewLogic)({
    onNavigationStateChange,
    onLoad,
    onError,
    onHttpErrorProp,
    onLoadEnd,
    onLoadProgress,
    onLoadStart,
    onRenderProcessGoneProp,
    onMessageProp,
    onOpenWindowProp,
    startInLoadingState,
    originWhitelist,
    onShouldStartLoadWithRequestProp,
    onShouldStartLoadWithRequestCallback
  });
  (0, import_react.useImperativeHandle)(ref, () => ({
    goForward: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.goForward(webViewRef.current),
    goBack: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.goBack(webViewRef.current),
    reload: () => {
      setViewState(
        "LOADING"
      );
      if (webViewRef.current) {
        import_RNCWebViewNativeComponent.Commands.reload(webViewRef.current);
      }
    },
    stopLoading: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.stopLoading(webViewRef.current),
    postMessage: (data) => webViewRef.current && import_RNCWebViewNativeComponent.Commands.postMessage(webViewRef.current, data),
    injectJavaScript: (data) => webViewRef.current && import_RNCWebViewNativeComponent.Commands.injectJavaScript(webViewRef.current, data),
    requestFocus: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.requestFocus(webViewRef.current),
    clearFormData: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.clearFormData(webViewRef.current),
    clearCache: (includeDiskFiles) => webViewRef.current && import_RNCWebViewNativeComponent.Commands.clearCache(webViewRef.current, includeDiskFiles),
    clearHistory: () => webViewRef.current && import_RNCWebViewNativeComponent.Commands.clearHistory(webViewRef.current)
  }), [setViewState, webViewRef]);
  const directEventCallbacks = (0, import_react.useMemo)(() => ({
    onShouldStartLoadWithRequest,
    onMessage
  }), [onMessage, onShouldStartLoadWithRequest]);
  (0, import_react.useEffect)(() => {
    import_BatchedBridge.default.registerCallableModule(messagingModuleName, directEventCallbacks);
    return () => import_BatchedBridge.default.unregisterCallableModule(messagingModuleName);
  }, [messagingModuleName, directEventCallbacks]);
  let otherView;
  if (viewState === "LOADING") {
    otherView = (renderLoading || import_WebViewShared.defaultRenderLoading)();
  } else if (viewState === "ERROR") {
    (0, import_invariant.default)(lastErrorEvent != null, "lastErrorEvent expected to be non-null");
    if (lastErrorEvent) {
      otherView = (renderError || import_WebViewShared.defaultRenderError)(
        lastErrorEvent.domain,
        lastErrorEvent.code,
        lastErrorEvent.description
      );
    }
  } else if (viewState !== "IDLE") {
    console.error(`RNCWebView invalid state encountered: ${viewState}`);
  }
  const webViewStyles = [import_WebView.default.container, import_WebView.default.webView, style];
  const webViewContainerStyle = [import_WebView.default.container, containerStyle];
  if (typeof source !== "number" && source && "method" in source) {
    if (source.method === "POST" && source.headers) {
      console.warn(
        "WebView: `source.headers` is not supported when using POST."
      );
    } else if (source.method === "GET" && source.body) {
      console.warn("WebView: `source.body` is not supported when using GET.");
    }
  }
  const NativeWebView = nativeConfig?.component || import_RNCWebViewNativeComponent.default;
  const sourceResolved = resolveAssetSource(source);
  const newSource = typeof sourceResolved === "object" ? Object.entries(sourceResolved).reduce((prev, [currKey, currValue]) => {
    return {
      ...prev,
      [currKey]: currKey === "headers" && currValue && typeof currValue === "object" ? Object.entries(currValue).map(
        ([key, value]) => {
          return {
            name: key,
            value
          };
        }
      ) : currValue
    };
  }, {}) : sourceResolved;
  const webView = /* @__PURE__ */ import_react.default.createElement(
    NativeWebView,
    {
      key: "webViewKey",
      ...otherProps,
      messagingEnabled: typeof onMessageProp === "function",
      messagingModuleName,
      hasOnScroll: !!otherProps.onScroll,
      onLoadingError,
      onLoadingFinish,
      onLoadingProgress,
      onLoadingStart,
      onHttpError,
      onRenderProcessGone,
      onMessage,
      onOpenWindow,
      hasOnOpenWindowEvent: onOpenWindowProp !== void 0,
      onShouldStartLoadWithRequest,
      ref: webViewRef,
      source: sourceResolved,
      newSource,
      style: webViewStyles,
      overScrollMode,
      javaScriptEnabled,
      thirdPartyCookiesEnabled,
      scalesPageToFit,
      allowsFullscreenVideo,
      allowFileAccess,
      saveFormDataDisabled,
      cacheEnabled,
      androidLayerType,
      setSupportMultipleWindows,
      setBuiltInZoomControls,
      setDisplayZoomControls,
      nestedScrollEnabled,
      injectedJavaScriptObject: JSON.stringify(injectedJavaScriptObject),
      ...nativeConfig?.props
    }
  );
  return /* @__PURE__ */ import_react.default.createElement(import_react_native.View, { style: webViewContainerStyle }, webView, otherView);
});
const { isFileUploadSupported } = import_NativeRNCWebView.default;
const WebView = Object.assign(WebViewComponent, { isFileUploadSupported });
var WebView_android_default = WebView;

},
"./WebViewShared": function(module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var WebViewShared_exports = {};
__export(WebViewShared_exports, {
  createOnShouldStartLoadWithRequest: () => createOnShouldStartLoadWithRequest,
  defaultOriginWhitelist: () => defaultOriginWhitelist,
  defaultRenderError: () => defaultRenderError,
  defaultRenderLoading: () => defaultRenderLoading,
  useWebViewLogic: () => useWebViewLogic
});
module.exports = __toCommonJS(WebViewShared_exports);
var import_escape_string_regexp = __toESM(require("escape-string-regexp"));
var import_react = __toESM(require("react"));
var import_react_native = require("react-native");
var import_WebView = __toESM(require("./WebView.styles"));
const defaultOriginWhitelist = ["http://*", "https://*"];
const extractOrigin = (url) => {
  const result = /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url);
  return result === null ? "" : result[0];
};
const originWhitelistToRegex = (originWhitelist) => `^${(0, import_escape_string_regexp.default)(originWhitelist).replace(/\\\*/g, ".*")}`;
const passesWhitelist = (compiledWhitelist, url) => {
  const origin = extractOrigin(url);
  return compiledWhitelist.some((x) => new RegExp(x).test(origin));
};
const compileWhitelist = (originWhitelist) => ["about:blank", ...originWhitelist || []].map(originWhitelistToRegex);
const createOnShouldStartLoadWithRequest = (loadRequest, originWhitelist, onShouldStartLoadWithRequest) => {
  return ({ nativeEvent }) => {
    let shouldStart = true;
    const { url, lockIdentifier } = nativeEvent;
    if (!passesWhitelist(compileWhitelist(originWhitelist), url)) {
      import_react_native.Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          return import_react_native.Linking.openURL(url);
        }
        console.warn(`Can't open url: ${url}`);
        return void 0;
      }).catch((e) => {
        console.warn("Error opening URL: ", e);
      });
      shouldStart = false;
    } else if (onShouldStartLoadWithRequest) {
      shouldStart = onShouldStartLoadWithRequest(nativeEvent);
    }
    loadRequest(shouldStart, url, lockIdentifier);
  };
};
const defaultRenderLoading = () => /* @__PURE__ */ import_react.default.createElement(import_react_native.View, { style: import_WebView.default.loadingOrErrorView }, /* @__PURE__ */ import_react.default.createElement(import_react_native.ActivityIndicator, null));
const defaultRenderError = (errorDomain, errorCode, errorDesc) => /* @__PURE__ */ import_react.default.createElement(import_react_native.View, { style: import_WebView.default.loadingOrErrorView }, /* @__PURE__ */ import_react.default.createElement(import_react_native.Text, { style: import_WebView.default.errorTextTitle }, "Error loading page"), /* @__PURE__ */ import_react.default.createElement(import_react_native.Text, { style: import_WebView.default.errorText }, `Domain: ${errorDomain}`), /* @__PURE__ */ import_react.default.createElement(import_react_native.Text, { style: import_WebView.default.errorText }, `Error Code: ${errorCode}`), /* @__PURE__ */ import_react.default.createElement(import_react_native.Text, { style: import_WebView.default.errorText }, `Description: ${errorDesc}`));
const useWebViewLogic = ({
  startInLoadingState,
  onNavigationStateChange,
  onLoadStart,
  onLoad,
  onLoadProgress,
  onLoadEnd,
  onError,
  onHttpErrorProp,
  onMessageProp,
  onOpenWindowProp,
  onRenderProcessGoneProp,
  onContentProcessDidTerminateProp,
  originWhitelist,
  onShouldStartLoadWithRequestProp,
  onShouldStartLoadWithRequestCallback
}) => {
  const [viewState, setViewState] = (0, import_react.useState)(startInLoadingState ? "LOADING" : "IDLE");
  const [lastErrorEvent, setLastErrorEvent] = (0, import_react.useState)(null);
  const startUrl = (0, import_react.useRef)(null);
  const updateNavigationState = (0, import_react.useCallback)((event) => {
    onNavigationStateChange?.(event.nativeEvent);
  }, [onNavigationStateChange]);
  const onLoadingStart = (0, import_react.useCallback)((event) => {
    startUrl.current = event.nativeEvent.url;
    onLoadStart?.(event);
    updateNavigationState(event);
  }, [onLoadStart, updateNavigationState]);
  const onLoadingError = (0, import_react.useCallback)((event) => {
    event.persist();
    if (onError) {
      onError(event);
    } else {
      console.warn("Encountered an error loading page", event.nativeEvent);
    }
    onLoadEnd?.(event);
    if (event.isDefaultPrevented()) {
      return;
    }
    ;
    setViewState("ERROR");
    setLastErrorEvent(event.nativeEvent);
  }, [onError, onLoadEnd]);
  const onHttpError = (0, import_react.useCallback)((event) => {
    onHttpErrorProp?.(event);
  }, [onHttpErrorProp]);
  const onRenderProcessGone = (0, import_react.useCallback)((event) => {
    onRenderProcessGoneProp?.(event);
  }, [onRenderProcessGoneProp]);
  const onContentProcessDidTerminate = (0, import_react.useCallback)((event) => {
    onContentProcessDidTerminateProp?.(event);
  }, [onContentProcessDidTerminateProp]);
  const onLoadingFinish = (0, import_react.useCallback)((event) => {
    onLoad?.(event);
    onLoadEnd?.(event);
    const { nativeEvent: { url } } = event;
    if (import_react_native.Platform.OS !== "android" || url === startUrl.current) {
      setViewState("IDLE");
    }
    updateNavigationState(event);
  }, [onLoad, onLoadEnd, updateNavigationState]);
  const onMessage = (0, import_react.useCallback)((event) => {
    onMessageProp?.(event);
  }, [onMessageProp]);
  const onLoadingProgress = (0, import_react.useCallback)((event) => {
    const { nativeEvent: { progress } } = event;
    if (import_react_native.Platform.OS === "android" && progress === 1) {
      setViewState((prevViewState) => prevViewState === "LOADING" ? "IDLE" : prevViewState);
    }
    onLoadProgress?.(event);
  }, [onLoadProgress]);
  const onShouldStartLoadWithRequest = (0, import_react.useMemo)(
    () => createOnShouldStartLoadWithRequest(
      onShouldStartLoadWithRequestCallback,
      originWhitelist,
      onShouldStartLoadWithRequestProp
    ),
    [originWhitelist, onShouldStartLoadWithRequestProp, onShouldStartLoadWithRequestCallback]
  );
  const onOpenWindow = (0, import_react.useCallback)((event) => {
    onOpenWindowProp?.(event);
  }, [onOpenWindowProp]);
  return {
    onShouldStartLoadWithRequest,
    onLoadingStart,
    onLoadingProgress,
    onLoadingError,
    onLoadingFinish,
    onHttpError,
    onRenderProcessGone,
    onContentProcessDidTerminate,
    onMessage,
    onOpenWindow,
    viewState,
    setViewState,
    lastErrorEvent
  };
};

},
"./WebView.styles": function(module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var WebView_styles_exports = {};
__export(WebView_styles_exports, {
  default: () => WebView_styles_default
});
module.exports = __toCommonJS(WebView_styles_exports);
var import_react_native = require("react-native");
const styles = import_react_native.StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden"
  },
  loadingOrErrorView: {
    position: "absolute",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "100%",
    backgroundColor: "white"
  },
  loadingProgressBar: {
    height: 20
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 2
  },
  errorTextTitle: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 10
  },
  webView: {
    backgroundColor: "#ffffff"
  }
});
var WebView_styles_default = styles;

} };
    const cache = Object.create(null);
    function require(name) {
        if (Object.prototype.hasOwnProperty.call(external, name)) return external[name];
        if (!factories[name]) throw new Error('Unknown embedded browser dependency');
        if (cache[name]) return cache[name].exports;
        const module = { exports: {} }; cache[name] = module;
        factories[name](module, module.exports, require); return module.exports;
    }
    return require('./WebView.android').default;
}
