## Defaults (AFK)

- List rows: **Local** (`http://127.0.0.1:<port>`) + each entry in `publicUrls`.
- Prefer https when setting `publicUrl`; list keeps all unique public URLs.
- After stop: child gone, but `lastPublicUrls` stay so Copy still works until next start replaces them.
- Empty public list → show local only + "No public URL yet" helper under public section.

## API

```ts
{
  localUrl: string;
  publicUrl: string | null;
  publicUrls: string[];
  // ...existing fields
}
```

## GUI

Replace single Public URL row with:
1. Local URL row + Copy
2. For each `publicUrls` entry: Public URL row + Copy (feedback scoped by URL string)
3. If no public URLs: one disabled public row with `ngrok.noUrl`
