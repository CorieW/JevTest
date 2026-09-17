# Security

Report vulnerabilities privately through [GitHub's vulnerability reporting form](https://github.com/CorieW/JevTest/security/advisories/new). Do not include credentials or sensitive application evidence in public issues.

JevTest executes application actions and saves observations. Use controlled test systems, synthetic fixtures, and a restricted action space. Review generated artifacts before sharing them. Read the data-handling constraints in [the project guide](docs/project-guide.md#data-handling-and-operating-constraints).

API credentials belong in environment variables or ignored local environment files. Live API checks are opt-in and do not run in public CI. The `Verify` check scans tracked files for common credential formats, including TypeSafe keys. GitHub secret scanning and push protection supplement this check; no scanner detects every possible secret.
