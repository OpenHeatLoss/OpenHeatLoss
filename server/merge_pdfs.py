#!/usr/bin/env python3
"""
Customer pack merger.
Merges a list of PDF file paths (passed as a JSON array on argv[1])
into a single output file (argv[2]).
Skips any path that is null, empty, or non-existent.
"""

import sys
import json
import os
from pypdf import PdfWriter, PdfReader


def merge_pdfs(input_paths, output_path):
    writer = PdfWriter()
    merged = 0
    for p in input_paths:
        if not p:
            continue
        if not os.path.exists(p):
            print(f"Warning: skipping missing file: {p}", file=sys.stderr)
            continue
        reader = PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)
        merged += 1

    if merged == 0:
        raise RuntimeError("No valid PDF files to merge")

    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"Merged {merged} PDF(s) into {output_path}")
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: merge_pdfs.py <paths_json> <output_pdf>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], 'r') as f:
        paths = json.load(f)

    merge_pdfs(paths, sys.argv[2])
