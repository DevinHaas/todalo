# 0008: One Tauri client for web, Mac and iPhone; no Swift port for now

Status: Accepted, 6 November 2026.

Goals, seasons, rituals and the Coach are built once in the shared Tauri client
(`apps/client`), which runs in the browser, on macOS and on iOS. A native
SwiftUI port was assessed at roughly 3–5 weeks of agent-driven work (8–12 for a
solo Swift developer) just to reach parity, with the schedule grid as the main
risk. It would bring native notifications, widgets and Screen Time APIs (needed
for future app blocking). We chose one codebase across three platforms now and
left the port as a later decision. The backend API is client-agnostic, so a
future Swift client can reuse it unchanged.
