## Context

Claude sidebar toggle is the UX template (`GET`/`PUT /api/claude-code` + `Switch` in `App.tsx`). Ngrok needs a real child process, not only a config flag.

## Goals / Non-Goals

**Goals:** Toggle starts/stops `ngrok http <port>`; status API; token via env or config; boot resume if `enabled`; shutdown stop; privacy-safe responses.

**Non-Goals:** Custom domains; alternate tunnel vendors; shipping ngrok binary.

## Decisions

1. **Binary:** Resolve `ngrok` via `Bun.which` / PATH. Missing → clear error, do not claim running.
2. **Token:** `NGROK_AUTHTOKEN` wins over `config.ngrok.authToken` when both set for the child env. GET returns `hasToken` only.
3. **Public URL:** Poll `http://127.0.0.1:4040/api/tunnels` after spawn (short timeout). Fail → enabled not persisted on fresh ON.
4. **Persist:** `enabled` saved only after successful start (ON) or after stop (OFF). Token saves independently.
5. **Boot:** After listen, if `ngrok.enabled`, best-effort start (log failure; proxy stays up).
6. **Security:** Management origin checks unchanged; never log token or tunnel request bodies.

## Risks

- Port 4040 conflict → URL discovery fails; surface error.
- Free ngrok session limits → user-facing error from process exit.
