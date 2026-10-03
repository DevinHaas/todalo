# Ramble captures are staged, not written to the DB until the session ends

Todos captured during a ramble session could be written to Postgres the moment each one is recognized, or held client-side/connection-side until the user confirms.

We chose staging: nothing is written until "Add tasks" is clicked (or discarded, writing nothing). This makes "remove last"/undo a plain in-memory mutation instead of a real delete, and means an accidentally closed modal or tab leaves no partial tasks behind. The tradeoff: if the WebSocket connection drops mid-session before the user says "that's all," the whole session's captures are lost — there's no server-side persistence of in-progress state to recover from.
