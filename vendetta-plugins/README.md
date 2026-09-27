# Vendetta plugins

### Message Logger (compatibility fix)
`https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/message-logger/`

Keeps cached deleted messages visible and handles bulk deletions. Disable the
old Message Logger before installing this build. See
[setup, changes and testing notes](plugins/message-logger/README.md).

Build just this plugin with `node build.mjs message-logger`; run its regression
suite with `npm run test:message-logger` after installing dependencies.

### Picture Links
`https://redstonekasi.github.io/vendetta-plugins/picture-links`  
Link's Pictures.

### devkitplus
`https://redstonekasi.github.io/vendetta-plugins/devkitplus`  
Some useful features for making development easier, currently:

- Exposing often used functions on window (see
  [here](https://github.com/redstonekasi/vendetta-plugins/blob/main/plugins/devkitplus/globals.js)
  for a list)
- Auto-connecting to debugger websocket (and React DevTools if you have that)

### Realmoji
`https://redstonekasi.github.io/vendetta-plugins/realmoji`  
Makes (freemojis)[https://beefers.github.io/strife/Freemoji] real.

### URL import
`https://redstonekasi.github.io/vendetta-plugins/url-import`  
Allows you to install plugins directly from a URL's action sheet.

### No typing
`https://redstonekasi.github.io/vendetta-plugins/no-typing`  
Hides your typing status from others.
