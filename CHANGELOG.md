# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-14

### Added
- `migrateMessage` / `migrateMessages`: pure functions that convert AI SDK 4.x stored messages
  (top-level `content`, `reasoning`, `toolInvocations`, `experimental_attachments`, `annotations`, v4.2 `parts`,
  `role: "data"`) to v5+ UIMessage parts, and normalise v5/v6 messages (`rawInput` to `input`). Already-current messages pass through.
- Loss report with stable codes and three severities (`moved`, `estimated`, `lost`).
- `uimessage-migrate/check`: `checkMessages` runs the validator and `convertToModelMessages` of the installed `ai`
  (5, 6 or 7) and lists tool calls that have no result; `resolveAi` finds the project's `ai` first.
- `uimessage-migrate` CLI for JSON and JSONL dumps (streaming) with `--out`, `--failed`, `--report`, `--dry-run`,
  `--no-validate`, `--fail-on`, `--incomplete-tool`, `--data-role`, `--signature-provider`, `--messages-key`, `--lang`.
- English and Korean CLI output (`--lang en|ko`, `UIMESSAGE_MIGRATE_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`).

### Security
- Dev dependency security updates: `zod` 4.6.7 and an `undici` 6.29.1 override (probe `ai` versions only; no runtime dependencies).

### Known issues
- The output-path guard does not detect hard links between the input and `--out`/`--failed`/`--report` files.
- `--help` exits with code 1; this is not documented yet.
- With `--no-validate` the summary wording still mentions validation.
- The sample dump `examples/v4-dump.jsonl` is not included in the npm package (it is in the repository).
