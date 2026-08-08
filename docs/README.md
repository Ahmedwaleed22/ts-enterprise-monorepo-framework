# API documentation

One reference site for every package in the workspace, built with
[API Extractor](https://api-extractor.com/) and API Documenter.

```bash
pnpm docs        # build → extract → document
```

That runs three steps, which are also available individually:

| Script            | What it does                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `pnpm build`      | Compiles each package's `src` to `dist`, including `.d.ts`                          |
| `pnpm api:extract` | Runs API Extractor per package: refreshes `etc/*.api.md` and writes the doc model   |
| `pnpm api:document` | Merges every doc model into the markdown site under [`docs/api`](./api)            |
| `pnpm api:check`  | CI variant of `api:extract` — fails instead of updating the API report              |

Analysis starts from the built `.d.ts`, not from `src`, so what gets documented
is exactly what a consumer can import.

## The pieces

- [`config/api-extractor.base.json`](../config/api-extractor.base.json) — every
  setting lives here, so packages stay consistent and their doc models can be
  merged.
- `packages/<name>/api-extractor.json` — a two-line file that extends the base.
- `packages/<name>/etc/<name>.api.md` — the **API report**: a readable snapshot
  of the package's public surface, tracked in Git. A diff there is the review
  signal that an API changed. `<name>.public.api.md` is the same thing with
  `@beta` trimmed, i.e. what a consumer sees if the previews are stripped from a
  release.
- `common/temp/api/*.api.json` — the doc models, one per package. Regenerated
  every run and gitignored; this shared folder is what makes a single combined
  site possible.
- [`docs/api`](./api) — the generated markdown. Rewritten from scratch on every
  run, so never edit it by hand.

## Adding a package to the pipeline

1. Make sure the package builds declarations to `dist/index.d.ts` and has
   `"types"` in its `package.json`.
2. Add `api-extractor.json`:

   ```json
   {
     "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
     "extends": "../../config/api-extractor.base.json"
   }
   ```

3. Copy `tsdoc.json` from an existing package.
4. Add the scripts:

   ```json
   "api:extract": "api-extractor run --local",
   "api:check": "api-extractor run"
   ```

5. Create an empty `etc/` folder — API Extractor will not create it itself.
6. Run `pnpm docs` and commit the new `etc/*.api.md`.

The base config assumes packages sit two levels below the workspace root
(`packages/<name>` or `apps/<name>`), which is what the doc model's
`../../common/temp` path depends on.

## Release tags

Every export must carry a TSDoc release tag — `ae-missing-release-tag` is an
error, not a warning, so an untagged export fails the build. So are
`ae-forgotten-export` (a public type referencing something never exported) and
`ae-incompatible-release-tags` (a stable API referencing a less stable one).

| Tag         | Meaning                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `@public`   | Supported. Breaking changes need a major version.                             |
| `@beta`     | Usable and documented, but still moving.                                      |
| `@internal` | Not exported from the entry point. Trimmed from the docs; change freely.      |
| `@alpha`    | Avoid — see below.                                                            |

`@alpha` is not a weaker `@beta` in practice: API Extractor unconditionally
drops `@alpha` **class methods** from the doc model, whatever
`releaseTagsToTrim` says, so such a method silently vanishes from the generated
site and any `{@link}` pointing at it breaks. Properties, functions, interfaces
and classes tagged `@alpha` are kept. Use `@beta` for anything that should stay
documented.

A tag on a class or interface applies to its members, and a member can narrow
it — that is how a `@public` class exposes a `@beta` property without tripping
`ae-incompatible-release-tags`.

## Writing the comments

Undocumented exports do not fail the build, but they are recorded in the API
report as `// (undocumented)` and listed at the bottom of the file, so the
gaps stay visible. Beyond the summary, the tags worth reaching for are
`@remarks` for the caveats, `@param` / `@returns` / `@throws`, `@defaultValue`,
`@example`, and `@virtual` / `@override` / `@sealed` on class members.
