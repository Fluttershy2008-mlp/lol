// MIT. Generated from the pinned Discord WebView source; see ../LICENSE and ../README.md.
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
  const messagingModuleName = (0, import_react.useRef)(`WebViewMessageHandler${uniqueRef += 1}`).current;
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
