# Python

Load when the diff changes `*.py`, `pyproject.toml`, `setup.cfg`, `setup.py`, `requirements*.txt`, `Pipfile*`, `poetry.lock`, `uv.lock`, `tox.ini` or `pytest.ini`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Tests: `pytest`, or the project's test task.
- Lint: `ruff check`, or `flake8`.
- Types: `mypy` or `pyright`, when the project configures one.
- Format: `ruff format --check` or `black --check`, when configured.

A change to `pyproject.toml`, `setup.cfg`, `setup.py`, `tox.ini`, `pytest.ini`, `conftest.py`, `noxfile.py` or a lockfile means asking again before any approved command.

## Look for

- A mutable default argument (`def f(x=[])`).
- A bare `except:` or `except Exception: pass` that hides real failures.
- `subprocess` with `shell=True` and input in the command; `os.system`.
- `pickle.loads`, `yaml.load` without `SafeLoader`, `eval` or `exec` on outside data.
- SQL built with f-strings or `%`; use parameters.
- Input in `open()` or `os.path.join`: path traversal.
- `requests` calls with no `timeout`, or `verify=False`.
- `assert` used for input checks (removed under `python -O`).
- Naive and aware datetimes mixed; money in `float` instead of `Decimal` or integer cents.
- Missing `await` on a coroutine; blocking calls inside `async` code.
- Files and connections opened without `with`.
