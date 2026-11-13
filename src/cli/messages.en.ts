// All user-facing CLI text (English). Keep the key set identical to messages.ko.ts.
export const en = {
  'help.text': `Usage: uimessage-migrate <input.json|input.jsonl ...> [options]

Migrate stored Vercel AI SDK chat history (v4 messages, v5/v6 parts) to the current
UIMessage format, validate the result with the "ai" package installed in your
project, and report everything that was moved, guessed or lost.

Input: JSON (an array, or one object) or JSONL (one message, or one
conversation with a "messages" array, per line).

Options:
  --out <file>                 write migrated records as JSONL
  --failed <file>              write rows that could not be migrated (line number, error code, original)
  --report <file>              write a machine-readable JSON report
  --dry-run                    migrate and validate, print the summary, write no files
  --no-validate                skip the ai validator and the model-message conversion
  --fail-on none|lost|estimated
                               exit 1 when losses of that severity (or worse) exist (default none)
  --incomplete-tool keep|error|drop
                               tool calls without a result: keep, turn into output-error, or remove (default keep)
  --data-role part|drop        role "data" messages: move into a data part, or drop (default part)
  --signature-provider <name>  keep reasoning signatures under providerMetadata.<name>.signature
  --messages-key <key>         property that holds the messages of a conversation row (default messages)
  --lang en|ko                 output language (also UIMESSAGE_MIGRATE_LANG, LC_ALL, LC_MESSAGES, LANG)
  --help                       show this help
  --version                    show the version

Exit codes: 0 ok, 1 failed rows or --fail-on triggered, 2 usage or file error,
3 no "ai" package found for validation.`,
  'usage.hint': 'Run uimessage-migrate --help for usage.',
  'version.line': 'uimessage-migrate {version}',

  'summary.title': 'uimessage-migrate {version}',
  'summary.validator': 'validator: ai@{version} ({source})',
  'summary.validatorSkipped': 'validator: skipped (--no-validate)',
  'summary.migrated': 'migrated {migrated}/{records} records (passthrough {passthrough}, failed {failed}, dropped messages {dropped})',
  'summary.losses': 'losses: {total} (lost {lost}, estimated {estimated}, moved {moved})',
  'summary.lossRow': '  {count} x {code} ({severity})',
  'summary.unpaired': 'unpaired tool calls: {count}',
  'summary.unpairedHint': '  They pass validation, but providers may reject a tool call without a result. Try --incomplete-tool error.',
  'summary.modelConversion': 'model conversion: ok {ok}, error {error}, skipped {skipped}',
  'summary.dryRun': 'dry run: no files were written',
  'summary.wrote': 'wrote {file}',
  'summary.failOn': '--fail-on {level}: {count} loss(es) at that level or worse',
  'summary.failedRows': 'failed rows: {count} (see the failed file or rerun with --failed <file>)',
  'warn.aiRange': 'warning: ai@{version} is outside the supported range (>=5 <8)',

  'warn.noRecords': 'warning: no records found in {files}. Check that the file is not empty and was exported correctly.',

  'err.unknownOption': 'Unknown option {option}.',
  'err.missingValue': 'Option {option} needs a value.',
  'err.badValue': 'Invalid value "{value}" for {option}. Allowed: {allowed}.',
  'err.noInput': 'No input file given. Pass at least one .json or .jsonl file.',
  'err.inputMissing': 'Input file not found: {file}. Check the path.',
  'err.inputNotFile': 'Input is not a file: {file}. Pass a .json or .jsonl file.',
  'err.noOutput': 'Nothing to write. Add --out <file>, --report <file> or --failed <file>, or use --dry-run.',
  'err.aiNotFound': 'Could not find the "ai" package for validation. Install it in your project (npm install ai) or use --no-validate.',
  'err.aiUnusable': 'The installed "ai" package cannot be used for validation (version 5 or later is required). Upgrade it (npm install ai@latest) or use --no-validate.',
  'err.invalidJsonFile': 'Could not parse {file} as JSON: {reason}. Use .jsonl for one JSON value per line.',
  'err.writeFailed': 'Could not write {file}: {reason}. Check that the folder exists and is writable.',
  'err.outputIsInput': 'Refusing to write {file}: it is the same file as an input or another output. Choose a different output path so the original is kept.',
  'err.readFailed': 'Could not read {file}: {reason}.',
  'err.unexpected': 'Unexpected error: {reason}',
} as const;
