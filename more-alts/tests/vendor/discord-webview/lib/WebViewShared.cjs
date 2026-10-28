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
