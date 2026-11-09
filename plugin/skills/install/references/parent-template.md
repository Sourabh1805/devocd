# Key rules and the company line

The helper builds the parent file from state with `render-parent`, so you never write its layout. You supply three things in the state draft: `name`, `description` and `keyRules`. This page says what makes them good, and ends with the draft's shape.

## name

The company's name as the company writes it, at most 60 characters.

## description

One plain line, at most 120 characters, saying what the company does and who for, so an agent knows where it is working. No links, markup or rules.

- Good: `Makes billing software for small clinics in the EU.`
- Weak: `A great company.` (tells an agent nothing)

## keyRules

The parent file loads in every session under the company folder, even when the standards files can't be read. Key rules are the few rules an agent must know without opening anything else. Together they must fit in about 300 estimated tokens, roughly 1,200 characters.

A key rule is all of these:
- stated as mandatory by a confirmed source: must, must not, never, always, required;
- about the whole company, not one team's procedure (on-call rotation and ticket triage stay in the standards);
- one short imperative line, under about 100 characters, keeping its threshold or number.

Not a key rule: guidance ("prefer", "should"), anything unconfirmed, anything flagged, anything quoting a secret.

Write each key rule in short words of your own, keeping its meaning, and say which source it came from in the draft. Don't add a source note inside the rule itself; the standards file holds that.

- Good: `Use TLS 1.2 or newer for traffic between services.`
- Good: `Never copy production data to a developer laptop.`
- Too long: `All of our services, wherever they run, must always make sure to use TLS version 1.2 or anything newer for their traffic.`

Every candidate goes in the draft. Never drop or merge candidates to make them fit. If they don't fit, `render-parent` refuses and writes nothing; then the user chooses which to keep, or in a non-interactive run you list them all and stop.

## The state draft

Write `.devocd/state.draft.json` with the Write tool, in this shape:

```json
{
  "version": 1,
  "kind": "company",
  "name": "Acme Example Co",
  "description": "Makes billing software for small clinics in the EU.",
  "parentFile": "<preflight's parentFile>",
  "keyRules": ["Never copy production data to a developer laptop."],
  "sources": [{ "type": "file", "ref": "setup/notes/security.md", "readAt": "<YYYY-MM-DD>" }]
}
```

- `parentFile`: exactly what preflight gave, `CLAUDE.md` or `CLAUDE.local.md`.
- `sources`: each source you read, with `readAt` today. A file's `ref` is rewritten, never copied: resolve the answers file's `ref` against the answers file's folder, then write that file's path from the company folder, with forward slashes. A `web` or `assumption` source saved as a file is rewritten the same way. Other types keep their `ref` (a space, project or URL). `interview.md` has a worked example.
- No `projects`: the helper keeps the registered projects.
