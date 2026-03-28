# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| < 3.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Email:** security@nxio.me
2. **GitHub Security Advisories:** [Report a vulnerability](https://github.com/nxio-me/buddy/security/advisories/new)

**Do not open a public issue for security vulnerabilities.**

### Response Timeline

- **72 hours:** Initial acknowledgment
- **7 days:** Fix for critical vulnerabilities
- **30 days:** Fix for non-critical vulnerabilities

### Scope

In scope:
- Authentication bypass (OAuth 2.1, Bearer token, cookie session)
- Token leakage (BUDDY_TOKEN exposure)
- XSS in the dashboard (markdown rendering, edge notes, activity summaries)
- SQL injection in D1 queries
- Encryption weaknesses (AES-256-GCM for secret nodes)
- CSRF bypass

Out of scope:
- Denial of service (handled by Cloudflare)
- Social engineering
- Attacks requiring physical access
- Issues in third-party dependencies (report upstream)

## Security Architecture

buddy uses a single credential model (`BUDDY_TOKEN`) with:
- Timing-safe HMAC comparison for all token checks
- OAuth 2.1 with mandatory PKCE (S256)
- AES-256-GCM encryption for `type: secret` nodes via HKDF key derivation
- Content Security Policy headers on all responses
- HTML sanitization on all rendered content (custom tag-allowlist sanitizer)
- Security audit trail (auth events logged with hashed IP)

See [docs/token-rotation.md](docs/token-rotation.md) for token management.
