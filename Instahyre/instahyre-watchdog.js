const DEFAULT_STALL_TIMEOUT_MS = 120000;

function shouldRecoverStall({ busy, startedAt, now, timeoutMs = DEFAULT_STALL_TIMEOUT_MS }) {
  return Boolean(busy && startedAt > 0 && now - startedAt >= timeoutMs);
}

module.exports = { DEFAULT_STALL_TIMEOUT_MS, shouldRecoverStall };
