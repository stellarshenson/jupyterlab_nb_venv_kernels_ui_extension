/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const path = require('path');
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

// Galata resolves its baseURL as use.baseURL -> TARGET_URL -> hardcoded :8888, and its
// base config sets no use.baseURL, so this file must supply it. One variable feeds both
// ends: here and jupyter_server_test_config.py.
const PORT = process.env.JUPYTER_TEST_PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;

// The suite registers, unregisters and deletes kernels and environments. nb_venv_kernels
// keeps its registry under ~/.venv and ~/.uv, and user kernelspecs live under
// ~/.local/share/jupyter/kernels, so the test server gets a scratch HOME with the server
// root inside it, as a workspace under a user's home is in production. JUPYTER_SERVER_ROOT is overridden because a JupyterHub session exports the
// real workspace there, and nb_venv_kernels reads it before the server's root_dir.
// Set at module scope so the workers see the same paths (the module runs in each).
const SCRATCH = path.join(__dirname, '.tmp');
process.env.NBVK_TEST_HOME = path.join(SCRATCH, 'home');
process.env.NBVK_TEST_ROOT = path.join(SCRATCH, 'home', 'workspace');

module.exports = {
  ...baseConfig,
  // Every spec mutates the one server's registry and kernelspec list.
  workers: 1,
  fullyParallel: false,
  use: {
    ...baseConfig.use,
    baseURL: BASE_URL
  },
  webServer: {
    // The webServer starts before globalSetup, so the sweep is chained here.
    command: 'node sweep-scratch.js && jlpm start',
    url: `${BASE_URL}/lab`,
    timeout: 120 * 1000,
    // Never adopt a server this run did not start: it would be the developer's own lab.
    reuseExistingServer: false,
    env: {
      HOME: process.env.NBVK_TEST_HOME,
      JUPYTER_DATA_DIR: path.join(
        process.env.NBVK_TEST_HOME,
        '.local/share/jupyter'
      ),
      JUPYTER_CONFIG_DIR: path.join(process.env.NBVK_TEST_HOME, '.jupyter'),
      JUPYTER_SERVER_ROOT: process.env.NBVK_TEST_ROOT,
      JUPYTERLAB_GALATA_ROOT_DIR: process.env.NBVK_TEST_ROOT
    }
  }
};
