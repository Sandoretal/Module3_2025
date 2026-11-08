"""Render the 2025 student notebooks to HTML for the course website (docs/).

This repository holds no solution notebooks. As a second line of defence, the
build stops if any notebook in the repository, or any file it would publish,
looks like a solution (its name contains "solution", "withanswers" or
"withsolutions"). The pages are shown un-run: every saved output and
execution count is cleared.

Afterwards it rebuilds docs/notebook-index.js (the list of notebook sections
used by the site search) and the per-tutorial downloads in docs/downloads/.

The source notebooks are not modified.

Usage (from the repository root):
    python tools/render_site_notebooks.py
"""

import re
import shutil
import sys
from pathlib import Path

import nbformat
from nbconvert import HTMLExporter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "rendered-notebooks"

# The student notebooks shown on the site.
NOTEBOOKS = [
    "tutorial_1/Introduction_and_functions.ipynb",
    "tutorial_1/Tutorial_1_extra_exercises/Extra_exercises_tutorial_1.ipynb",
    "tutorial_2/pandas_ehr_tutorial_part1_exercises.ipynb",
    "tutorial_2/pandas_ehr_tutorial_part2_exercises.ipynb",
    "tutorial_2/pandas_ehr_tutorial_part3_exercises.ipynb",
    "tutorial_3/TimeSeriesAnalysis.ipynb",
    "tutorial_4/Intro_toML.ipynb",
]

# Notebooks in the repository that are deliberately not shown on the site.
NOT_ON_SITE = {"test.ipynb", "environments_and_requirements/environments.ipynb"}

SOLUTION = re.compile(r"(solution|withanswers|withsolutions)", re.I)

# Images referenced by relative path from the notebooks' markdown.
ASSETS = [
    "tutorial_1/sam_file.png",
    "tutorial_1/vcf_format.png",
    "tutorial_2/images",
    "tutorial_3/images",
]


def check_notebooks():
    found = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*.ipynb")
             if ".ipynb_checkpoints" not in p.parts}
    problems = [f"{rel}: solution notebook in the repository" for rel in sorted(found) if SOLUTION.search(rel)]
    problems += [f"{rel}: missing" for rel in NOTEBOOKS if rel not in found]
    others = found - set(NOTEBOOKS) - NOT_ON_SITE
    if others:
        problems.append(f"notebooks neither on the site nor in NOT_ON_SITE: {sorted(others)}")
    if problems:
        sys.exit("Notebooks are not ready for the site:\n" + "\n".join(problems))


def strip_outputs(nb):
    for cell in nb.cells:
        if cell.cell_type == "code":
            cell.outputs = []
            cell.execution_count = None
    return nb


def main():
    check_notebooks()
    exporter = HTMLExporter()
    problems = []

    if OUT.exists():
        shutil.rmtree(OUT)

    for rel in NOTEBOOKS:
        nb = strip_outputs(nbformat.read(ROOT / rel, as_version=4))
        body, _ = exporter.from_notebook_node(nb)
        if '<div class="jp-OutputArea-child' in body:
            problems.append(f"{rel}: still contains outputs")

        dest = OUT / Path(rel).with_suffix(".html")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(body, encoding="utf-8")
        print(f"{rel} -> {dest.relative_to(ROOT)}")

    for rel in ASSETS:
        src, dest = ROOT / rel, OUT / rel
        if src.is_dir():
            shutil.copytree(src, dest, dirs_exist_ok=True)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

    leaked = [p for p in OUT.rglob("*") if SOLUTION.search(p.name)]
    if leaked:
        problems.append(f"solution files in the rendered pages: {leaked}")
    if problems:
        sys.exit("Rendered HTML is not clean:\n" + "\n".join(problems))

    # Refresh the notebook section index used by the site search (docs/search.html).
    import build_search_index
    build_search_index.main()

    # Refresh the per-tutorial downloads (docs/downloads/tutorial_N.zip).
    import build_tutorial_zips
    build_tutorial_zips.main()


if __name__ == "__main__":
    main()
