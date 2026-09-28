/**
 * Recreate the scratch HOME and server root the test server runs in.
 * Run before the server starts: a Ctrl+C skips any teardown, so the next run
 * must not inherit registered environments or kernelspecs from the last one.
 */
const fs = require('fs');
const path = require('path');

const SCRATCH = path.join(__dirname, '.tmp');

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(path.join(SCRATCH, 'home', 'workspace'), { recursive: true });
