#!/usr/bin/env python3
"""Exercise real Git indexes and branch comparisons in disposable repositories."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CHECKER = Path(__file__).with_name("check_pr_size.py").resolve()


class SizeGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull})
        self.git("init", "-b", "main")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Size gate test")
        self.git("config", "core.hooksPath", str(self.repo / "no-hooks"))
        self.write("base.txt", "base\n")
        self.commit()

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.repo, env=self.env, check=True, capture_output=True
        ).stdout.decode().strip()

    def write(self, name, content):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())

    def commit(self):
        self.git("add", "--all")
        self.git("commit", "-m", "Fixture change")

    def check(self, *args):
        result = subprocess.run(
            [sys.executable, str(CHECKER), *args], cwd=self.repo,
            env=self.env, capture_output=True, text=True,
        )
        return result.returncode, json.loads(result.stdout or result.stderr)

    def test_thresholds(self):
        for lines, status, code in [(250, "pass", 0), (251, "warning", 0),
                                     (500, "warning", 0), (501, "blocked", 1)]:
            with self.subTest(lines=lines):
                self.write("change.md", "Line\n" * lines)
                self.git("add", "change.md")
                result, report = self.check("--staged")
                self.assertEqual((result, report["status"]), (code, status))

    def test_index_not_worktree_and_unusual_path(self):
        name = "docs/with\ttab\nand newline.md"
        self.write(name, "Staged\n")
        self.git("add", "--", name)
        self.write(name, "Unstaged\n" * 600)
        self.write("untracked.md", "Not measured\n")
        code, report = self.check("--staged")
        self.assertEqual((code, report["authoredLines"]), (0, 1))
        self.assertEqual(report["files"][0]["path"], name)
        self.assertEqual(report["untrackedPathsNotMeasured"], ["untracked.md"])

    def test_file_limit(self):
        for index in range(16):
            self.write(f"file-{index}.md", "Line\n")
        self.git("add", "--all")
        self.assertEqual(self.check("--staged")[0], 1)

    def test_generated_is_explicit_and_visible(self):
        self.write("generated.json", "Line\n" * 600)
        self.git("add", "--all")
        self.assertEqual(self.check("--staged")[0], 1)
        code, report = self.check("--staged", "--generated", "generated.json")
        self.assertEqual((code, report["authoredLines"], report["totalTextLines"]), (0, 0, 600))
        self.assertEqual(self.check("--staged", "--generated", "missing.json")[0], 2)

    def test_binary_needs_review(self):
        self.write("asset.bin", b"\x00\x01")
        self.git("add", "--all")
        self.assertEqual(self.check("--staged")[0], 1)

    def test_pr_merge_base_and_deletions(self):
        self.write("remove.md", "Old\n" * 260)
        self.commit()
        self.git("switch", "-c", "feat/change")
        self.git("rm", "remove.md")
        self.write("replace.md", "New\n" * 250)
        self.commit()
        self.git("switch", "main")
        self.write("unrelated.md", "Other\n" * 1000)
        self.commit()
        code, report = self.check("--base", "main", "--head", "feat/change")
        self.assertEqual((code, report["authoredLines"]), (1, 510))
        self.assertEqual(report["totalFiles"], 2)
        self.assertEqual(self.check("--base", "missing")[0], 2)


if __name__ == "__main__":
    unittest.main()
