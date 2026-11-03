const assert = require('assert');
const { shouldRecoverStall } = require('./instahyre-watchdog');

assert.strictEqual(shouldRecoverStall({ busy: true, startedAt: 1000, now: 119000 }), false);
assert.strictEqual(shouldRecoverStall({ busy: true, startedAt: 1000, now: 121000 }), true);
assert.strictEqual(shouldRecoverStall({ busy: false, startedAt: 1000, now: 121000 }), false);
assert.strictEqual(shouldRecoverStall({ busy: true, startedAt: 0, now: 121000 }), false);
console.log('instahyre-watchdog: all checks passed');
