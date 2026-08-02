"""Markdown -> .docx for the NewEra executive summary.

Deliberately small: it handles the subset the summary actually uses (headings,
paragraphs, bullets, numbered lists, tables, bold/italic/code spans, rules) and
nothing else. A general Markdown engine would be more code than the document.

    python md2docx.py input.md output.docx "Document Title"
"""

import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Inches

INK = RGBColor(0x11, 0x13, 0x16)
MUTED = RGBColor(0x5A, 0x60, 0x66)
ACCENT = RGBColor(0x3D, 0x6B, 0x1F)

INLINE = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)")


def add_runs(par, text):
    """Bold, italic and code spans. Everything else is literal."""
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            par.add_run(part[2:-2]).bold = True
        elif part.startswith("`") and part.endswith("`"):
            r = par.add_run(part[1:-1])
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
            r.font.color.rgb = ACCENT
        elif part.startswith("*") and part.endswith("*"):
            par.add_run(part[1:-1]).italic = True
        else:
            par.add_run(part)


def style_base(doc):
    n = doc.styles["Normal"]
    n.font.name = "Calibri"
    n.font.size = Pt(10.5)
    n.font.color.rgb = INK
    n.paragraph_format.space_after = Pt(8)
    n.paragraph_format.line_spacing = 1.22


def emit_table(doc, rows):
    """rows[0] is the header; the separator row has already been dropped."""
    cols = len(rows[0])
    t = doc.add_table(rows=0, cols=cols)
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    for i, row in enumerate(rows):
        cells = t.add_row().cells
        for j, cell in enumerate(row[:cols]):
            cells[j].text = ""
            par = cells[j].paragraphs[0]
            par.paragraph_format.space_after = Pt(2)
            add_runs(par, cell.strip())
            if i == 0:
                for r in par.runs:
                    r.bold = True
    doc.add_paragraph()


def convert(md_path, out_path, title):
    # utf-8-sig: a BOM ahead of the first "#" stops it being read as a heading,
    # and PowerShell's Out-File writes one by default.
    lines = open(md_path, encoding="utf-8-sig").read().splitlines()
    doc = Document()
    style_base(doc)
    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(1.0)
        s.top_margin = s.bottom_margin = Inches(0.9)

    h = doc.add_paragraph()
    h.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = h.add_run(title)
    r.bold = True
    r.font.size = Pt(24)
    r.font.color.rgb = INK

    i = 0
    pending_table = []
    while i < len(lines):
        line = lines[i].rstrip()

        # Tables accumulate until a non-table line.
        if line.startswith("|") and line.endswith("|"):
            cells = [c for c in line.strip("|").split("|")]
            if not re.match(r"^[\s:\-|]+$", line.strip("|")):
                pending_table.append(cells)
            i += 1
            continue
        if pending_table:
            emit_table(doc, pending_table)
            pending_table = []

        if not line.strip():
            i += 1
            continue

        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            text = line.lstrip("# ").strip()
            # The document already carries its title, so a lone H1 would repeat it.
            if level == 1 and text.lower().strip(" .") in title.lower():
                i += 1
                continue
            # Real Heading styles, not bold Normal runs: they give the document
            # an outline, so Word's navigation pane and any generated table of
            # contents work, and screen readers get the structure.
            p = doc.add_heading("", level=min(level, 4))
            p.paragraph_format.space_before = Pt(16 if level <= 2 else 10)
            p.paragraph_format.space_after = Pt(4)
            run = p.add_run(text)
            run.bold = True
            run.font.name = "Calibri"
            run.font.size = Pt({1: 18, 2: 14, 3: 11.5}.get(level, 10.5))
            run.font.color.rgb = INK if level <= 2 else MUTED
        elif re.match(r"^\s*[-*]\s+", line):
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_after = Pt(3)
            add_runs(p, re.sub(r"^\s*[-*]\s+", "", line))
        elif re.match(r"^\s*\d+\.\s+", line):
            p = doc.add_paragraph(style="List Number")
            p.paragraph_format.space_after = Pt(3)
            add_runs(p, re.sub(r"^\s*\d+\.\s+", "", line))
        elif line.strip() in ("---", "***", "___"):
            pass  # a rule between sections is noise once headings carry weight
        elif line.startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            add_runs(p, line.lstrip("> ").strip())
            for r in p.runs:
                r.italic = True
                r.font.color.rgb = MUTED
        else:
            add_runs(doc.add_paragraph(), line)
        i += 1

    if pending_table:
        emit_table(doc, pending_table)

    doc.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Document")
