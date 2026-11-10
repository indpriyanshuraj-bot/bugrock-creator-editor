# Security policy

This is an experimental project. There are no supported releases yet; `v1.0.0` will define them.

## Reporting

Use GitHub's private vulnerability reporting (Security → Advisories → Report a vulnerability).
Do not open a public issue for a security problem.

## Threat model, such as it is

The local daemon (v0.4.0) will bind `127.0.0.1`, require a paired token, and allowlist origins.
Anything that accepts untrusted add-on content should be assumed to be handling hostile JSON: the
parser must not execute scripts, resolve remote URLs, or follow paths outside the project root.
`applyPatch` (v0.5.0) is the highest-risk surface and gets path-containment tests before it ships.
