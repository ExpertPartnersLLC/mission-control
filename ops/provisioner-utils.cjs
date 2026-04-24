// Pure helpers extracted from mc-provisioner-daemon.js so they can be
// exercised by the vitest suite without spinning up the daemon's socket
// listener. CJS because the daemon itself is CJS.

// Upper bound on the setTimeout duration for child-process supervision.
// Without a ceiling, a client that sends {timeoutMs: 2**53} would hold
// both the spawned child and the timer handle indefinitely, which
// CodeQL flags as js/resource-exhaustion. The allowlisted commands
// (useradd, install, cp, chown, rm, userdel, systemctl) all complete
// in seconds; 10 minutes is generous.
const MAX_PROVISIONER_TIMEOUT_MS = 10 * 60 * 1000
const MIN_PROVISIONER_TIMEOUT_MS = 1000
const DEFAULT_PROVISIONER_TIMEOUT_MS = 10000

function clampTimeout(value) {
  const n = Number(value || DEFAULT_PROVISIONER_TIMEOUT_MS)
  if (!Number.isFinite(n)) return DEFAULT_PROVISIONER_TIMEOUT_MS
  return Math.min(MAX_PROVISIONER_TIMEOUT_MS, Math.max(MIN_PROVISIONER_TIMEOUT_MS, n))
}

module.exports = {
  MAX_PROVISIONER_TIMEOUT_MS,
  MIN_PROVISIONER_TIMEOUT_MS,
  DEFAULT_PROVISIONER_TIMEOUT_MS,
  clampTimeout,
}
