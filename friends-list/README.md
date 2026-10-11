# Friends List

A Revenge mobile plugin by **fluttershy_simper**.

Shows all your Discord friends and the total number you have, including online and offline friends. Accepted friendships count; pending requests, blocked users and ignored users do not.

## Install

In **Settings → Plugins → +**, paste:

```text
https://raw.githubusercontent.com/Fluttershy2008-mlp/lol/main/friends-list/
```

Enable the plugin and reopen Settings. A **Friends List** shortcut appears in the **Revenge** section beside **Blocked Users**, with the friend count on the right. When Blocked Users is not installed, the shortcut appears directly below Plugins.

You can also open the list from the plugin’s **Configure** button.

## Features

- Total friend count stays visible when you search.
- Search display names, usernames or user IDs.
- Tap any friend to open their native Discord profile.
- Updates when friendships change, after account switches and when the app resumes.
- Includes friends whose profile is not cached; they still count and can be opened by ID.
- Virtualized alphabetical list and light/dark appearance.
- No bulk profile requests or changes to your friendships.

The list uses Discord’s current in-app relationship store. If Discord is still loading or the store is unavailable, it shows an error instead of claiming that you have zero friends. Tap **Refresh** after Discord has connected.

## Development

No dependencies are required. From this folder, run:

```sh
npm test
```

This builds the expression-style `index.js` consumed by Revenge’s Vendetta compatibility loader, calculates its manifest hash and runs the model/runtime/settings integration checks.

Test coverage uses a mocked Discord/Revenge runtime. Device verification in Revenge is still required for version-specific native modules.
