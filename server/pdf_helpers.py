#!/usr/bin/env python3
"""
Shared helpers for PDF generators.
resolve_tokens: extracted from generate_cover_letter_pdf.py so it is defined
once rather than duplicated across every generator that supports merge tokens.
"""
import re


def resolve_tokens(text, tokens):
    """Replace all {token} placeholders in text with values from the tokens dict.
    Any unresolved {token}-shaped placeholders are stripped afterwards."""
    if not text:
        return text
    for key, value in tokens.items():
        text = text.replace('{' + key + '}', str(value) if value else '')
    text = re.sub(r'\{[a-z_]+\}', '', text)
    return text
