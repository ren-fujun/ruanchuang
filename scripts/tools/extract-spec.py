from docx import Document
import sys, json

path = r"C:\Users\Lenovo\Downloads\【智汇中枢】——基于AI大模型的辅导员跨部门协同督办系统.docx"
doc = Document(path)
print("== PARAGRAPHS ==")
for i, p in enumerate(doc.paragraphs):
    if p.text.strip():
        style = p.style.name if p.style is not None else "None"
        print(f"[{i}] ({style}) {p.text}")
print("\n== TABLES ==")
for ti, table in enumerate(doc.tables):
    print(f"\n--- Table {ti} ({len(table.rows)}x{len(table.columns)}) ---")
    for row in table.rows:
        cells = []
        for c in row.cells:
            cells.append(" / ".join(p.text.strip() for p in c.paragraphs if p.text.strip()))
        print(" | ".join(cells))
