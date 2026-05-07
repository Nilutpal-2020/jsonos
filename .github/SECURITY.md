# Security Policy

## Supported versions

The latest deployed version of JSON OS at https://jsonos.online is the only supported version. Older builds are not patched.

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

If you believe you've found a security vulnerability — including XSS in the editor, prototype pollution via parsed JSON, share-link enumeration, schema validation bypasses, or anything that could be exploited against another user — please email:

> **jsonos.online@gmail.com**

with:

- A clear description of the issue
- Steps to reproduce (or a proof-of-concept)
- The browser / OS you tested on
- Your contact info if you'd like credit

We will acknowledge your report within **3 business days** and aim to provide a fix or mitigation timeline within **10 business days**.

## Scope

In scope:

- The frontend at jsonos.online
- The Cloudflare share-link Worker (`worker/`)
- Any code in this repository

Out of scope:

- Third-party services we link to (GitHub, Vercel, Cloudflare)
- Issues that require a compromised user device or browser

## Disclosure

We follow coordinated disclosure: we'll work with you to confirm and fix the issue, then publish a security advisory crediting you (unless you prefer otherwise).

Thank you for helping keep JSON OS and its users safe.
