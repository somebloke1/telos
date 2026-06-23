# Security Policy

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| 0.1.x   | :white_check_mark: Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in Telos, please report it responsibly.

### How to Report

**Private Disclosure (Preferred)**
- Send an email to: [INSERT SECURITY EMAIL]
- Include "SECURITY: Telos Vulnerability" in the subject line
- Provide as much detail as possible:
  - Steps to reproduce
  - Potential impact
  - Suggested fix (if any)

**GitHub Private Vulnerability Reporting**
- Use GitHub's [Private Vulnerability Reporting](https://github.com/somebloke1/telos/security/advisories) feature
- This allows for coordinated disclosure

### What to Expect

1. **Confirmation**: We'll acknowledge receipt of your report within 48 hours
2. **Assessment**: We'll assess the severity and impact within 5 business days
3. **Resolution**: We'll work on a fix and coordinate disclosure timeline
4. **Disclosure**: We'll publicly disclose the vulnerability after a fix is released

### Disclosure Timeline

We follow a responsible disclosure process:

- **Critical**: 7 days before public disclosure
- **High**: 14 days before public disclosure
- **Medium**: 30 days before public disclosure
- **Low**: 60 days before public disclosure

Timelines may be adjusted based on complexity and severity.

## Security Best Practices

### For Users

1. **Review Source Code**: Before using Telos, review the source code to understand what it does
2. **Use Trusted Sources**: Only install Telos from official sources (GitHub repo, npm packages)
3. **Keep Updated**: Use the latest version to get security fixes
4. **Report Issues**: If you notice suspicious behavior, report it immediately

### For Contributors

1. **Code Review**: All code changes go through review
2. **No External API Calls**: Telos doesn't make external network requests
3. **No File System Access**: Telos only uses Pi's normal file operations
4. **No Code Execution**: Telos doesn't execute arbitrary code outside Pi's normal operations

## Security Features

Telos is designed with security in mind:

- **No External Dependencies**: Minimal dependencies reduce attack surface
- **No Network Access**: Extension doesn't make external HTTP requests
- **No Secret Storage**: Goals are stored as plain text in session files
- **No Code Injection**: Extension doesn't inject executable code
- **Sandboxed**: Operates within Pi's security boundaries

## Known Limitations

1. **Goal Objectives**: Goals are stored in plain text in session files. Don't include sensitive information in goal objectives.

2. **Session Files**: Session files contain goal state. Protect session files if they contain sensitive information.

3. **No Encryption**: Goals and objectives are not encrypted. Assume session files can be read by anyone with file access.

## Security Audits

Telos has not undergone a formal security audit. We welcome security researchers to review the code and report vulnerabilities.

### Self-Assessment

- ✅ No external network requests
- ✅ No arbitrary code execution
- ✅ No secret storage
- ✅ No file system access beyond Pi's normal operations
- ✅ Minimal dependencies
- ⚠️ Goals stored in plain text
- ⚠️ No input sanitization (relies on Pi's handling)

## Vulnerability Response Process

1. **Receive Report**: Security team receives vulnerability report
2. **Triage**: Assess severity and confirm vulnerability
3. **Develop Fix**: Create patch to address vulnerability
4. **Test**: Thoroughly test the fix
5. **Release**: Publish new version with fix
6. **Disclosure**: Publish security advisory with details
7. **Credit**: Credit reporter (if desired)

## Severity Classification

We use the following severity classification:

| Severity | Definition                                      | Example                                   |
|----------|------------------------------------------------|-------------------------------------------|
| Critical | Exploitable without user interaction, high impact | RCE, arbitrary code execution           |
| High     | Exploitable with user interaction, high impact | Data exposure, privilege escalation      |
| Medium   | Limited impact, requires specific conditions  | Information disclosure, DoS              |
| Low      | Minimal impact, hard to exploit               | Minor information disclosure, UI issues  |

## Contact

For security-related questions or concerns:
- **Security Email**: [INSERT SECURITY EMAIL]
- **GitHub**: https://github.com/somebloke1/telos/security

## Acknowledgments

We thank all security researchers who help keep Telos secure by responsibly reporting vulnerabilities.

---

**Last Updated**: 2026-06-23
**Version**: 0.1.0