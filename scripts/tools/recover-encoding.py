from pathlib import Path

for name in ["Messages.tsx", "Profile.tsx"]:
    p = Path("src/pages") / name
    text = p.read_text(encoding="utf-8")
    try:
        recovered = text.encode("gbk", errors="replace").decode("utf-8", errors="replace")
    except Exception as exc:
        print(name, "encode failed", exc)
        continue
    out = Path("scripts") / ("recovered-" + name)
    out.write_text(recovered, encoding="utf-8")
    print(name, "bad chars:", recovered.count("\ufffd"), "question:", recovered.count("?"))
    for i, line in enumerate(recovered.splitlines(), 1):
        if "\ufffd" in line or "?" in line:
            print(i, line)
