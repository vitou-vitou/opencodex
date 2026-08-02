## 1. Backend snapshot

- [x] Add `publicUrls` + `localUrl` to `NgrokStatus`
- [x] Remember last public URLs across stop
- [x] Make `getNgrokRuntimeSnapshot` async; refresh from inspector

## 2. Routes

- [x] Await `ngrokDto` on all GET/PUT responses

## 3. GUI

- [x] URL list: local + each public; per-row Copy
- [x] i18n: `ngrok.urlsTitle`, `ngrok.urlsHint`, `ngrok.localUrl`

## 4. Tests

- [x] Snapshot exposes `publicUrls` / `localUrl`
- [x] Management GET includes new fields
- [x] Last public URLs remain after stop

## 5. Verify

- [x] ngrok tests green + GUI build + typecheck + aikido
