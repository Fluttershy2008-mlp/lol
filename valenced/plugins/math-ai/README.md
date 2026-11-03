# Math AI & Scientific Calculator

Refresh Fluttershy's Valenced repository, install **Math AI & Scientific Calculator**, and fully restart Discord.

Repository: https://fluttershy2008-mlp.github.io/lol/valenced/index.json

## Sigma hold and alignment fix (2.1.1)

Long-press is handled directly by the plugin instead of relying on Discord's action button to forward it. Hold Sigma for about 350 ms to open the Math AI settings/calculator panel. Releasing after a hold does not toggle auto-solve, including when opening the panel causes a rerender. Tap still toggles auto-solve.

The symbol is now smaller and centred within the native action-button spacing, with a 32 dp centred fallback. Discord's visual button remains inside a non-interactive wrapper so it cannot swallow long presses or expose a second accessibility target.

## Auto AI solve on Send (2.1.0)

- **Tap Σ** to toggle **Auto AI solve ON/OFF**. Purple means ON; grey means OFF. The choice is saved, starts OFF for existing installs, and is also available in Math AI settings.
- With **Auto AI solve ON**, type a math question in Discord and press the normal **Send** button. Complete expressions such as `2+2` send `4` immediately. Written questions and equations open the existing Math Nano companion; after it returns successfully, the plugin sends the answer to the original chat. The send request asks Nano for the answer without working steps.
- **Hold Σ** to open the full scientific calculator and AI panel.
- Turn Auto AI solve OFF for ordinary messages. The older offline **Solve when sending** switch remains independent; turn that off too to send literal arithmetic.

Key-free AI still requires the Math Nano companion APK and a prepared, supported AICore model. Keep the companion screen open during inference. This release does not change the companion or the native bridge, so an existing companion installation can be kept. It cannot provide invisible background Nano inference.

While an AI send is pending, repeat taps on the same request share one result; different sends are blocked. Cancelling, disabling Auto AI solve, stopping the plugin, or changing chat/account cancels that pending answer, including switching away and back. Errors or answers longer than 1,900 characters open the panel with the question/result and do not post the raw question. Native send failures are propagated without retrying. The original channel, attachments, mention policy, nonce and send options are retained. No chat history is read.

AI answers are generated and sent after your Send press; check them for mistakes. The default OFF mode lets you choose which questions to solve.

## Offline solve when sending (1.2.0)

Type `2+2` in the normal chat box and press Discord’s usual Send button: your message is sent as `4`. No leading `=` or extra calculator button is needed. **Solve when sending** is ON by default and can be turned off independently of inline previews in Math AI settings.

Scientific examples: `sin(30)` → `0.5` in DEG, `2^3^2` → `512`, `5!` → `120`, `3²+2³` → `17`, `sqrt(81)` → `9`, and `5 ft in cm` → `152.4 cm`. Simple arithmetic embedded in text also works, e.g. `I got 2+2 today` → `I got 4 today`.

The scientific panel now has extra keys for square/cube/general powers, square/cube/nth roots, inverse and hyperbolic trig (including asinh/acosh/atanh), log₂/log₁₀/ln, 10ˣ/eˣ, reciprocal, absolute value, factorial, nCr/nPr, remainder, floor/ceil/round, π/τ/e, scientific exponent EE, ANS and sign change. Functions use parentheses; binary functions such as `root(3,27)` and `ncr(10,3)` need a comma.

The separate offline Solve when sending feature is synchronous and offline when Auto AI solve is OFF. It never calls AI or an exchange-rate service, never starts another send, and preserves attachments, mentions and send options. Plain numbers, dates, code, links, mentions, equations, unsupported or invalid expressions are kept. Currency conversions stay in the preview; copy their dated result when needed. Disabling or stopping the plugin restores ordinary sending.

## Inline Calculator

Version 1.1.1 fixes the preview being covered by Discord’s floating input. The preview now shares the input’s native layout root, so its height is included above the existing controls. The input keeps its own positioning, animation and capsule styling. No fixed height is imposed on the preview.

Type `=` at the start of your chat draft to show a live answer above the message box. Tap the answer pill to copy it. Normal text stays unchanged; Solve when sending rewrites recognised maths only when you press Send. Both inline previews and currency lookups have separate ON/OFF controls in Math AI settings.

- `= 5x5` → `= 25`
- `= 12 * 4.5` → `= 54`
- `= sqrt(144) + sin(30)*8 + 3^2` → `= 25` in DEG
- `= 5 ft in cm` → `= 152.4 cm`
- `= 32 f to c` → `= 0 c`
- `= 10 USD to AUD` or `= 10 USD to SGD` → a dated exchange-rate result

Arithmetic and unit conversion run offline and need no key. Supported unit families include length, mass, area, volume, temperature, time, speed, angle and pressure; use `to` or `in`. Incompatible units and temperatures below absolute zero show an error.

Currency lookups use [Frankfurter v2](https://frankfurter.dev/javascript/), require internet and need no API key. The service receives the currency pair only, without the amount, question, chat history or AI key. Results include the published rate date; they are reference rates, not bank quotes or intraday prices. Requests are debounced while you type, cached for ten minutes, bounded to ten seconds and cancelled when the draft changes or the plugin stops. Unsupported currencies and connection failures show an inline error.

The ∑ icon uses a fixed 24×24 image in Discord's native ChatInputActionButton, with a centred fallback when the native control is unavailable. This avoids Android text baseline/font-padding differences.

## Use the full calculator and AI panel

1. Paste the math problem into your normal Discord chat box without sending it.
2. Hold **Σ** beside the chat controls. It loads the current draft into the panel, removing a leading `=`.
3. Tap **Calculate** for an expression, or **AI solve** for an equation or written problem.
4. Read the answer, then **Copy answer** or **Append answer to draft**. Review and send using Discord normally.

The question can also be pasted or typed directly into the panel. Open it through **Settings → Valenced → Math AI** if your Discord version does not expose the chat button. The panel only inserts or copies answers on request. Auto AI solve sends an answer only in response to your Discord Send press and does not read chat history.

## Scientific calculator

Runs offline without an API key. Supports DEG/RAD, parentheses, implicit multiplication, right-associative powers, roots, percentages, factorials, trigonometry and inverse/hyperbolic trig, logs, exp, abs, floor/ceil/round, combinations, permutations, remainder, π, e and the last calculator answer (`ans`). Real numbers only; results use floating-point arithmetic and are rounded to 14 significant digits for display. Long expressions and excessive nesting are bounded.

Examples: `2(3+4)`, `sin(30)`, `cos(pi/3)` in RAD, `sqrt(81)`, `root(3,-8)`, `5!`, `ncr(10,3)`, `npr(10,3)`, `log(1000)`, `ln(e)`, `2^3^2`, `1e-3`. Postfix `%` divides by 100, so `200*10%` is 20 and `200+10%` is 200.1. For equations, variables, units, or written questions use AI solve.

## Gemini Nano AI setup (2.0.0)

Cloud AI configuration and API key fields have been removed. AI solve now uses Gemini Nano on the device through the **Math Nano** companion Android app. This release requires two installs:

1. Install [Math Nano companion 1.0.0 APK](Math_Nano_Companion_v1.0.0.apk) on your phone.
2. Refresh the repository and install/update **Math AI & Scientific Calculator 2.1.1**, then fully close and reopen Discord to load the native bridge.
3. Open the plugin's **AI setup → Open Nano setup**. The companion checks whether Gemini Nano is ready, downloadable, downloading or unavailable.
4. If offered, tap **Download / prepare Nano**, keep the screen open and allow the model to finish downloading. The model may be large and needs internet and storage for initial setup.
5. Return to Valenced. Paste a question into the panel and tap **AI solve**. The companion opens in the foreground, solves locally, and returns the answer to the plugin for review, copying or appending.

No API key, cloud AI endpoint or paid API account is used for inference. The initial model preparation is managed by Android AICore; currency previews continue to use Frankfurter separately. The companion does not save questions or answers to files and disables Android backup. Google SDK/system components may have their own diagnostics and network activity.

The companion is necessary because ML Kit requires the AICore binding permission in the Android app manifest. A Valenced plugin ZIP cannot add that permission to Discord. Keeping the SDK in its own APK also avoids conflicts with Discord's Kotlin and Google libraries, and keeps Nano inference in a real foreground Activity as required by AICore.

Google lists the Samsung Galaxy S26 Ultra as supported, but runtime availability depends on the installed AICore version, downloaded model and device configuration. If unavailable, update Android AICore/Google Play system components and retry; don't clear AICore data as a troubleshooting default. An unlocked bootloader can prevent Nano access. The scientific calculator and automatic send-time maths remain usable regardless of Nano availability.

Answers can be wrong. Check the final answer, assumptions and working. Cancelling or stopping the plugin cancels the identified companion request; results from old requests are rejected. Switching away pauses inference; return to the companion and check/retry. Input is bounded to 6,000 characters and checked against Nano's context window; output is bounded. Inference waits up to two minutes, model preparation up to fifteen minutes, and the plugin's overall operation is bounded to twenty minutes.

SDK: `com.google.mlkit:genai-prompt:1.0.0-beta4`, with coroutines pinned to `1.11.0` for Google's documented download fix. Sources: [Google setup](https://developers.google.com/ml-kit/genai/prompt/android/get-started), [device support](https://developers.google.com/ml-kit/genai), [known issues](https://developers.google.com/ml-kit/known-issues).

## Compatibility and validation

Uses Valenced API v1 and the current Math plugin's imported chat-input path. Button insertion depends on Discord internals and can require a full restart; settings remain available when a button hook changes. Drafts are loaded only on request; Auto AI solve uses the message passed to Send. Appending checks the original account and channel, preserves the question, and is disabled for answers over 1,900 characters; copy longer answers instead. Auto AI solve is controlled by Σ or its settings switch; the older offline rewriting uses its separate Solve when sending switch.

Automated tests also cover Σ tap/hold, persisted AI mode, answer-only send, duplicate taps, metadata, failed/cancelled solves, long answers, context changes and plugin stop. They cover live draft previews, unit and currency conversions, cache/cancellation behaviour, native icon sizing, the parser, native Nano request/result/error handling, cancellation, lifecycle cleanup, settings key exclusion and packaged entry point. The bridge is compiled against Android and the companion is compiled against the real ML Kit SDK. Physical Samsung/Android and real AICore inference testing have not been performed.

Inspired by [mlemception's Math](https://github.com/mlemception/mlem-plugins/tree/main/plugins/math); this separate implementation does not bundle its source or icon.
