"""Build one download per tutorial: docs/downloads/tutorial_N.zip.

Each zip holds that tutorial's folder (notebooks, data, images and README).
Notebooks are packed with their outputs cleared, and system files and
checkpoints are skipped. The build fails if anything that looks like a
solution would be packed. render_site_notebooks.py runs this automatically;
it can also be run on its own:

    python tools/build_tutorial_zips.py
"""

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "downloads"
TUTORIALS = ["tutorial_1", "tutorial_2", "tutorial_3", "tutorial_4"]
SOLUTION = re.compile(r"(solution|withanswers|withsolutions)", re.I)
SKIP_NAMES = {".DS_Store", "Thumbs.db"}


def files_in(folder):
    for path in sorted((ROOT / folder).rglob("*")):
        if path.is_file() and path.name not in SKIP_NAMES and ".ipynb_checkpoints" not in path.parts:
            yield path


def cleared_notebook(path):
    nb = json.loads(path.read_text(encoding="utf-8"))
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            cell["outputs"] = []
            cell["execution_count"] = None
    return json.dumps(nb, indent=1, ensure_ascii=False) + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for folder in TUTORIALS:
        paths = list(files_in(folder))
        leaked = [p.relative_to(ROOT).as_posix() for p in paths if SOLUTION.search(p.name)]
        if leaked:
            sys.exit(f"{folder} contains solutions: {leaked}")

        dest = OUT / f"{folder}.zip"
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for path in paths:
                arcname = path.relative_to(ROOT).as_posix()
                if path.suffix == ".ipynb":
                    zf.writestr(arcname, cleared_notebook(path))
                else:
                    zf.write(path, arcname)
        print(f"{folder} -> {dest.relative_to(ROOT)} ({dest.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
