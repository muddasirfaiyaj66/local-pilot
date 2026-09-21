# Security Policy

## Supported versions

Security fixes land on the default branch (`main`). Use the latest release when possible.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

Email or privately message the maintainers with:

- Description and impact
- Steps to reproduce
- Affected OS / LocalPilot version if known

We aim to acknowledge reports within a few days.

## Scope notes

LocalPilot can control the desktop (browser, files, shell, screen). Treat as in-scope:

- Permission prompts and the kill switch
- Prompt injection from page, file, or screenshot content
- API key storage (`safeStorage`) and log redaction
