"""The wheel ships the agent skill (ACC-AGENT-34)."""
import sys
from pathlib import Path

ROOT = Path(__file__).parents[2]
NAME = "jupyterlab-nb-venv-kernels-ui-extension"


def test_pip_install_ships_the_skill():
    # the wheel puts SKILL.md under the environment, outside the Python package
    installed = Path(sys.prefix, "share", "jupyter", "agents", "skills", NAME, "SKILL.md")
    repository = ROOT / ".agents" / "skills" / NAME / "SKILL.md"
    assert installed.is_file() and installed.read_text() == repository.read_text(), (
        f"{installed} is missing or differs from the repository copy - run make install"
    )
