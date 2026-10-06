# Silent Server Invite

Experimental Revenge Mobile plugin, version 0.1.1.

Blocks standard new channel invite requests in this client and lets you save
and copy an existing Discord invite locally. **It cannot hide newly created
invites from Discord's audit logs or bots such as Quark Pro.**

## Install

Copy this entire directory URL:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/silent-server-invite/
```

In Revenge, open **Settings → Plugins**, tap **+**, paste the URL, and install.
The interface labels may vary by version. Enable the plugin, then open its
settings. Paste an existing invite, tap **Save existing invite**, and use
**Copy saved invite**. Saving and copying do not send requests to Discord.

If the plugin fails to load, blocking is not active. If it loads successfully,
the normal Create Invite screen may show an error because the plugin refuses
that request. Disabling the plugin restores normal invite creation.

## Compatibility and limits

Targets Revenge's Vendetta-compatible external plugin loader, like the other
URL-installed plugins in this repository. This is not a native Revenge Next
ZIP plugin. Android compatibility has not been tested on a device.

The hook targets `POST /channels/<id>/invites`. Discord updates or alternative
request paths can bypass it. Other clients are not covered. Existing links may
expire or be revoked, and bots can still track joins and invite uses. The
plugin does not validate which server a link belongs to or whether it works.

No account tokens are read. The saved link is kept in this plugin's local
storage; use **Clear saved invite** to remove it.

## Verification

```sh
node silent-server-invite/tests.cjs
```

The mocked tests use Revenge's injected API calling convention and check invite
blocking, forwarding unrelated requests, load/unload, storage and clipboard
actions, and failures when the required API is unavailable. Passing these
tests does not establish device compatibility or undetectability.
