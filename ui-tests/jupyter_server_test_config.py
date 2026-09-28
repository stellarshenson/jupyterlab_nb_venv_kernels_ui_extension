"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
import os

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)

# configure_jupyter_server pins port 8888 with port_retries = 0, so the test server
# dies rather than move when that port is already taken. Read the port from the
# environment so a developer running their own lab on 8888 can still run the suite.
# `or`, not a get() default: an exported-but-empty value must fall back too.
c.ServerApp.port = int(os.environ.get("JUPYTER_TEST_PORT") or "8888")

# A JupyterHub session's service prefix would otherwise leak into the test server
# and move every URL under /user/<name>/.
c.ServerApp.base_url = "/"

# A default server refuses to delete dot-directories through the contents API.
# Pin the default so a system config setting it True cannot hide a Remove that
# still depends on that API.
c.ContentsManager.allow_hidden = False

# A non-default card name: /api/kernel-path must resolve names through the
# server's configured kernel spec manager, not a fresh one that ignores config.
c.VEnvKernelSpecManager.name_format = "{language} [{source} test:{environment}]"

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
