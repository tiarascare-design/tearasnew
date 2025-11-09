// E2E master-reset runner (DISABLED)
// NOTE: The admin master-reset callable/HTTP endpoints have been removed from
// the Functions exports in this repository to avoid exposing destructive
// operations. This script originally automated requesting a token and
// performing a master reset against the local Functions emulator. It is
// intentionally disabled to prevent accidental runs.

console.error('run_master_reset_e2e.js: disabled — admin master-reset endpoints have been removed.');
console.error('If you need similar functionality for local emulator testing, create a safe, documented helper under functions/.tools that does not run against production.');
process.exit(1);
