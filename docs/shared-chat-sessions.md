# Shared chat sessions

The standalone compact `nx-ao-input` and full `nx-chat-ao` automatically pair on
the same page when their org/site and harness configuration match:

```js
const compact = document.createElement('nx-ao-input');
const full = document.createElement('nx-chat-ao');
for (const chat of [compact, full]) {
  chat.context = { org, site, path, view };
  container.append(chat);
}
```

Sending from the compact input appears in the full chat's transcript, and sending
from the full chat makes both inputs busy. Stop from either input stops that same
turn. Both join the existing controller directly through the session service;
the standalone input does not require a parent chat or host-wired send callbacks.

The pair shares initialization, connection, transcript, streaming/busy state,
approvals and episode selection. Harness configuration includes Coworker versus
CMA and the CMA activation key. Both components resolve the site's configuration;
hosts can supply `harnessConfig` when already resolved. No session key is needed.

Only opposite presentations pair: two full chats or two standalone compact inputs
remain independent. If several are mounted, each joins the first matching
conversation missing its presentation. Set `isolated = true` before mounting to
opt out of automatic pairing and start a fresh, independent session.

An input with an `onSubmit` callback remains host-controlled, using the existing
`onSubmit`, `onStop`, `onInput` and `getSkills` API. The full chat's embedded input
uses this mode and never acquires an additional session. The separate da-agent
`nx-chat` component is unchanged.

Drafts, context pills and attachments belong to each input. A rejected submission
(initializing, loading or busy) leaves them intact. Accepted submissions use the
sending UI's path/view context. An accepted standalone submission dispatches the
bubbling, composed `CHAT_EVENT.MESSAGE_SENT` (`nx-chat-message-sent`) event with
`{ org, site }`, so a host can reveal the full chat, for example by opening its
chat panel. Rejected submissions do not dispatch it.

While a reply runs, both the standalone input and the full chat's input replace
the textarea with a spinner and working message. While the agent waits on the
user (a pending question or tool permission), the full chat shows its question or
permission card and keeps the input disabled. The standalone input has no card,
so it shows a short "input needed" message with an Open chat button that
dispatches `PANEL_EVENT.OPEN` (`{ section: 'chat' }`) for the host to reveal the
full chat. A standalone input also reflects a `standalone` attribute and uses the
gradient composer look from `input.css`; the embedded input keeps the plain look.

Stop, approvals, Clear/New chat and episode selection operate on the shared
controller. Removing one UI only unsubscribes it; the last removal destroys the
controller and releases document listeners.

The first conversation preserves existing Coworker auto-resume and CMA's per-site
sessionStorage pointer. Additional conversations in the same scope and explicitly
isolated views start fresh, without reading or updating that resume pointer.

## Document commands

`CHAT_EVENT.SET_PROMPT` and `CHAT_EVENT.ADD_TO_CHAT` are delivered to **one** local
input, never broadcast. Add `target: chatElement` to `detail` to select an input,
or `org` and `site` to select an unambiguous pair. For example:

```js
document.dispatchEvent(new CustomEvent(CHAT_EVENT.SET_PROMPT, {
  detail: { target: compact, text: 'Review this page', autoSend: true },
}));
```

Within a pair the focused input wins, otherwise the first mounted input receives
the command. Ambiguous commands spanning unrelated conversations are ignored;
use an explicit target when several conversations are mounted.
