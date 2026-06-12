#!/usr/bin/env python3
"""
Customer pack PDF merger.
Merges a list of PDF file paths (passed as a JSON array on argv[1])
into a single output file (argv[2]).
Skips any path that is null, empty, or non-existent.

Uses pypdf. If not installed, installs it automatically via pip.
reportlab alone cannot read/merge existing PDFs.
"""

import sys
import json
import os
import subprocess


def ensure_pypdf():
    """Import pypdf, installing it if necessary."""
    try:
        import pypdf  # noqa: F401
        return
    except ImportError:
        pass
    print("pypdf not found — installing...", file=sys.stderr)
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', 'pypdf',
         '--break-system-packages', '--quiet'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to install pypdf: {result.stderr.strip()}"
        )


def merge_pdfs(input_paths, output_path):
    valid = [p for p in input_paths if p and os.path.exists(p)]
    if not valid:
        raise RuntimeError("No valid PDF files to merge")

    ensure_pypdf()
    from pypdf import PdfWriter, PdfReader

    writer = PdfWriter()
    for p in valid:
        reader = PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Merged {len(valid)} PDF(s) into {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: merge_pdfs.py <paths_json> <output_pdf>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], 'r') as f:
        paths = json.load(f)

    merge_pdfs(paths, sys.argv[2])
