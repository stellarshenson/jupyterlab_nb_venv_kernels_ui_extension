try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode:
    # https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn(
        "Importing 'jupyterlab_nb_venv_kernels_ui_extension' "
        "outside a proper installation."
    )
    __version__ = "dev"


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "@stellarshenson/jupyterlab-nb-venv-kernels-ui-extension"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "jupyterlab_nb_venv_kernels_ui_extension"
    }]


def _load_jupyter_server_extension(server_app):
    """Load the Jupyter server extension.

    Args:
        server_app: The Jupyter server application instance
    """
    from .handlers import setup_handlers

    setup_handlers(server_app.web_app)
    server_app.log.info(
        "jupyterlab_nb_venv_kernels_ui_extension server extension loaded."
    )
