#!/usr/bin/env python3
"""
Customer pack PDF merger.
Merges a list of PDF file paths (passed as a JSON array on argv[1])
into a single output file (argv[2]).
Skips any path that is null, empty, or non-existent.

Merge strategy (tried in order, first available wins):
  1. pdftk     — system tool, no Python deps
  2. pikepdf   — pip package
  3. pypdf     — pip package
"""

import sys
import json
import os
import subprocess


def merge_with_pdftk(input_paths, output_path):
    cmd = ['pdftk'] + input_paths + ['cat', 'output', output_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pdftk failed: {result.stderr}")


def merge_with_pikepdf(input_paths, output_path):
    import pikepdf
    pdf_out = pikepdf.Pdf.new()
    for p in input_paths:
        src = pikepdf.Pdf.open(p)
        pdf_out.pages.extend(src.pages)
    pdf_out.save(output_path)


def merge_with_pypdf(input_paths, output_path):
    from pypdf import PdfWriter, PdfReader
    writer = PdfWriter()
    for p in input_paths:
        reader = PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)
    with open(output_path, 'wb') as f:
        writer.write(f)


def merge_pdfs(input_paths, output_path):
    valid = [p for p in input_paths if p and os.path.exists(p)]
    if not valid:
        raise RuntimeError("No valid PDF files to merge")

    strategies = [
        ('pdftk',    merge_with_pdftk),
        ('pikepdf',  merge_with_pikepdf),
        ('pypdf',    merge_with_pypdf),
    ]

    last_error = None
    for name, fn in strategies:
        try:
            fn(valid, output_path)
            print(f"Merged {len(valid)} PDF(s) using {name} → {output_path}")
            return
        except Exception as e:
            print(f"Warning: {name} unavailable ({e}), trying next...", file=sys.stderr)
            last_error = e
            # Remove partial output if it exists
            if os.path.exists(output_path):
                os.unlink(output_path)

    raise RuntimeError(f"All merge strategies failed. Last error: {last_error}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: merge_pdfs.py <paths_json> <output_pdf>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], 'r') as f:
        paths = json.load(f)

    merge_pdfs(paths, sys.argv[2])
