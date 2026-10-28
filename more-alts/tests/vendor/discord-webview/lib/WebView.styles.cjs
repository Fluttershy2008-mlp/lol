// MIT. Generated from the pinned Discord WebView source; see ../LICENSE and ../README.md.
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
