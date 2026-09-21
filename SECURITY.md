# Security Policy

## Supported versions

LocalPilot is early (Phase 1). Security fixes land on the default branch.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

Email or privately message the maintainers with:

- Description and impact
- Steps to reproduce
- Affected OS / LocalPilot version if known

We aim to acknowledge reports within a few days.

## Scope notes

LocalPilot is designed to control the desktop (browser, files, shell) in later phases. Treat:

- Permission prompts and the kill switch as critical UX
- Prompt injection from page/file/screenshot content as in-scope
- API key storage (`safeStorage`) and log redaction as in-scope
