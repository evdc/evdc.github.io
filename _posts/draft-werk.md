I'm building `werk`, a tool for agentic coding. [There are many like it, but this one is mine.](https://www.usmcu.edu/Research/Marine-Corps-History-Division/Frequently-Requested-Topics/Marines-Rifle-Creed/)

It's super rough and looks ugly, so be warned. It's available here. ((TODO: put on github, link))

Here is a screenshot: ((TODO: screenshot))

werk intends to blend together three-ish things:
- An agentic coding harness: the core agent loop, model selection, permission gates, etc.
- A project management tool: tickets, Kanban, a PM agent that delegates to other agents, and tools to help keep track of everything that's happening.
- (Planned, experimental) an inference engine, that can more tightly integrate with the agent loop, and handle things like KV cache reuse in a way that's more transparent to the user. Also a playground for me to experiment with [ideas](https://arxiv.org/html/2608.03893v1) in [kv cache optimizations](https://arxiv.org/abs/2506.06266) and such.

It's written in Rust and built with Tauri. The frontend is SolidJS, because there's really no reason to keep writing React apps and dealing with the cost of the vdom in 2026.

Opus wrote most of it, of course. In the fashion of modern development, I critiqued plans, manually spot-tested the UI, and occasionally pushed back on some weird architectural decisions, generally favoring simplicity and elegance over whatever complexity it was trying to cook up.

Werk features (so far):
- A desktop app + mobile companion app (iOS), both of which talk to a `werk-server`. The server can run elsewhere e.g. on a VPS for isolation if you want; the apps are thin clients. I use Tailscale for connectivity.
- Durable state. That is: everything that happens (user message, LLM call, LLM response, tool call / result, permission gate approve/deny, ticket status change, ...) is saved to SQLite. Closing the app (or a server crash) doesn't lose session state, beyond possibly a streaming response that hasn't finalized, and can be resumed anywhere.
- 