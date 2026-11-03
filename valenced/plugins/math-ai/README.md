# Math AI & Scientific Calculator

Refresh Fluttershy's Valenced repository, install **Math AI & Scientific Calculator**, and fully restart Discord.

Repository: https://fluttershy2008-mlp.github.io/lol/valenced/index.json

## Solve when sending (1.2.0)

Type `2+2` in the normal chat box and press Discord’s usual Send button: your message is sent as `4`. No leading `=` or extra calculator button is needed. **Solve when sending** is ON by default and can be turned off independently of inline previews in Math AI settings.

Scientific examples: `sin(30)` → `0.5` in DEG, `2^3^2` → `512`, `5!` → `120`, `3²+2³` → `17`, `sqrt(81)` → `9`, and `5 ft in cm` → `152.4 cm`. Simple arithmetic embedded in text also works, e.g. `I got 2+2 today` → `I got 4 today`.

The scientific panel now has extra keys for square/cube/general powers, square/cube/nth roots, inverse and hyperbolic trig (including asinh/acosh/atanh), log₂/log₁₀/ln, 10ˣ/eˣ, reciprocal, absolute value, factorial, nCr/nPr, remainder, floor/ceil/round, π/τ/e, scientific exponent EE, ANS and sign change. Functions use parentheses; binary functions such as `root(3,27)` and `ncr(10,3)` need a comma.

Send-time solving is synchronous and offline. It never calls AI or an exchange-rate service, never starts another send, and preserves attachments, mentions and send options. Plain numbers, dates, code, links, mentions, equations, unsupported or invalid expressions are kept. Currency conversions stay in the preview; copy their dated result when needed. Disabling or stopping the plugin restores ordinary sending.

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
2. Tap **∑** beside the chat controls. It loads the current draft into the panel, removing a leading `=`.
3. Tap **Calculate** for an expression, or **AI solve** for an equation or written problem.
4. Read the answer, then **Copy answer** or **Append answer to draft**. Review and send using Discord normally.

The question can also be pasted or typed directly into the panel. Open it through **Settings → Valenced → Math AI** if your Discord version does not expose the chat button. The plugin never sends Discord messages automatically and does not read chat history.

## Scientific calculator

Runs offline without an API key. Supports DEG/RAD, parentheses, implicit multiplication, right-associative powers, roots, percentages, factorials, trigonometry and inverse/hyperbolic trig, logs, exp, abs, floor/ceil/round, combinations, permutations, remainder, π, e and the last calculator answer (`ans`). Real numbers only; results use floating-point arithmetic and are rounded to 14 significant digits for display. Long expressions and excessive nesting are bounded.

Examples: `2(3+4)`, `sin(30)`, `cos(pi/3)` in RAD, `sqrt(81)`, `root(3,-8)`, `5!`, `ncr(10,3)`, `npr(10,3)`, `log(1000)`, `ln(e)`, `2^3^2`, `1e-3`. Postfix `%` divides by 100, so `200*10%` is 20 and `200+10%` is 200.1. For equations, variables, units, or written questions use AI solve.

## AI setup

Open **AI setup** and supply your own provider's HTTPS **Chat Completions endpoint**, model name and API key. Defaults are `https://api.openai.com/v1/chat/completions` and `gpt-4.1-mini`; change the model to one your provider supports. Other providers must implement the same request/response format. A ChatGPT subscription does not provide API access or credits.

The API key is held in memory only and must be re-entered after a restart. It is never written to plugin JSON settings, logs or GitHub. Changing endpoint clears the key. Only the panel question and math instructions are transmitted, and only when AI solve is tapped; provider charges and privacy terms apply. Endpoint and model settings persist, while recent answers remain in memory. No shared key or free hosted service is included.

AI answers can be wrong: review assumptions, units and working. Choose whether to include working steps. Requests time out after 45 seconds, can be cancelled, and are cancelled when the plugin stops. Repeated taps cannot start duplicate requests. Unavailable clipboard, composer hooks, network, keys, credits and unsupported responses show actionable errors.

## Compatibility and validation

Uses Valenced API v1 and the current Math plugin's imported chat-input path. Button insertion depends on Discord internals and can require a full restart; settings remain available when a button hook changes. Drafts are loaded only on request. Appending checks the original account and channel, preserves the question, and is disabled for answers over 1,900 characters; copy longer answers instead. Automatic send-time solving is controlled by the separate Solve when sending switch.

Automated tests cover live draft previews, unit and currency conversions, cache/cancellation behaviour, native icon sizing, the parser, AI request/response/error handling, cancellation, lifecycle cleanup, settings key exclusion and packaged entry point. Physical Samsung/Android testing and live paid AI requests have not been performed.

Inspired by [mlemception's Math](https://github.com/mlemception/mlem-plugins/tree/main/plugins/math); this separate implementation does not bundle its source or icon.
