#!/usr/bin/env python3
"""Read-only size gate: 0 within budget, 1 review blocked, 2 invalid comparison."""

import argparse
import json
import subprocess
import sys


def git(*args):
    return subprocess.run(
        ["git", *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    ).stdout


def measure(staged, base, head, generated):
    # Resolve revisions before constructing a range; reject Git options.
    if staged:
        comparison = "index"
        revisions = ["--cached"]
    else:
        base_sha = git("rev-parse", "--verify", "--end-of-options", base + "^{commit}").decode().strip()
        head_sha = git("rev-parse", "--verify", "--end-of-options", head + "^{commit}").decode().strip()
        ancestor = git("merge-base", base_sha, head_sha).decode().strip()
        comparison = ancestor + ".." + head_sha
        revisions = [ancestor, head_sha]
    raw = git(
        "diff", "--no-ext-diff", "--no-textconv", "--no-renames",
        "--ignore-submodules=none", "--numstat", "-z", *revisions, "--"
    )
    files = []
    for record in raw.split(b"\0"):
        if not record:
            continue
        added, deleted, path_bytes = record.split(b"\t", 2)
        path = path_bytes.decode("utf-8", errors="surrogateescape")
        binary = added == b"-" or deleted == b"-"
        files.append({
            "path": path,
            "added": None if binary else int(added),
            "deleted": None if binary else int(deleted),
            "binary": binary,
            "generated": path in generated,
        })
    unknown = generated - {entry["path"] for entry in files}
    if unknown:
        raise ValueError("Generated paths are not in this diff: " + repr(sorted(unknown)))
    authored = [entry for entry in files if not entry["generated"]]
    lines = sum((entry["added"] or 0) + (entry["deleted"] or 0) for entry in authored)
    total = sum((entry["added"] or 0) + (entry["deleted"] or 0) for entry in files)
    blocked = []
    if lines > 500:
        blocked.append("More than 500 authored added/deleted lines: split the change.")
    if len(authored) > 15:
        blocked.append("More than 15 authored files: split the change.")
    if any(entry["binary"] for entry in authored):
        blocked.append("Authored binary changes cannot be measured: explicit review is needed.")
    untracked = git("ls-files", "--others", "--exclude-standard", "-z")
    return {
        "comparison": comparison,
        "status": "blocked" if blocked else "warning" if lines > 250 else "pass",
        "authoredLines": lines,
        "authoredFiles": len(authored),
        "totalTextLines": total,
        "totalFiles": len(files),
        "reasons": blocked,
        "warnings": ["More than 250 authored lines: consider splitting."] if lines > 250 else [],
        "untrackedPathsNotMeasured": [
            path.decode("utf-8", errors="surrogateescape")
            for path in untracked.split(b"\0") if path
        ],
        "files": files,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--staged", action="store_true", help="Measure the index only")
    mode.add_argument("--base", help="PR target branch; compare from its merge base")
    parser.add_argument("--head", default="HEAD", help="Committed PR tip (default: HEAD)")
    parser.add_argument(
        "--generated", action="append", default=[], metavar="PATH",
        help="Exact verified generated path; reported separately (repeatable)",
    )
    args = parser.parse_args()
    try:
        report = measure(args.staged, args.base, args.head, set(args.generated))
        print(json.dumps(report, indent=2))
        return 1 if report["status"] == "blocked" else 0
    except (subprocess.CalledProcessError, ValueError, OSError) as error:
        detail = error.stderr.decode(errors="replace").strip() if isinstance(
            error, subprocess.CalledProcessError
        ) else str(error)
        print(json.dumps({"status": "error", "error": detail}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
