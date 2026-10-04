import pytest


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setenv("LAB_DB", str(tmp_path / "lab.sqlite3"))
    from backend import store

    monkeypatch.setattr(store, "ANALYSES", tmp_path / "analyses")
    try:
        from backend import main

        monkeypatch.setattr(main, "PAPERS_DIR", tmp_path / "papers")
    except ImportError:
        pass
