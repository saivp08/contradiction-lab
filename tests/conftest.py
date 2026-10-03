import pytest


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setenv("LAB_DB", str(tmp_path / "lab.sqlite3"))
