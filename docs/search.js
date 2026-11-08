// Site-wide search for search.html.
// Sources: the glossary (glossary-data.js), the notebook section index
// (notebook-index.js, built by tools/build_search_index.py) and the site's own
// pages, which are read live so results always match what the pages show.
(() => {
  const TYPES = [
    { key: "glossary", label: "Glossary" },
    { key: "concept", label: "Tutorial concepts" },
    { key: "notebook", label: "Notebook sections" },
    { key: "file", label: "Files" },
    { key: "resource", label: "Resources" },
    { key: "person", label: "People" }
  ];
  const PER_GROUP = 8;
  const NOTEBOOK_NAMES = {
    Introduction_and_functions: "Introduction to Python notebook",
    Extra_exercises_tutorial_1: "Tutorial 1 extra exercises",
    pandas_ehr_tutorial_part1_exercises: "Part 1 notebook: wrangling EHR data",
    pandas_ehr_tutorial_part2_exercises: "Part 2 notebook: visualisation, cleaning and missing data",
    pandas_ehr_tutorial_part3_exercises: "Part 3 notebook: hypothesis testing and associations",
    TimeSeriesAnalysis: "Time series notebook",
    Intro_toML: "Introduction to machine learning notebook"
  };

  const input = document.getElementById("searchInput");
  const status = document.getElementById("searchStatus");
  const results = document.getElementById("searchResults");
  const scopes = document.getElementById("searchScopes");
  const items = [];
  let activeScope = "";
  let pagesLoaded = false;

  const normalise = (text) =>
    String(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const stripTags = (html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent.replace(/\s+/g, " ").trim();
  };
  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  function add(item) {
    item.haystack = normalise(`${item.title} ${item.text || ""} ${item.extra || ""}`);
    item.titleNorm = normalise(item.title);
    items.push(item);
  }

  /* Sources ---------------------------------------------------------- */

  (window.MODULE3_GLOSSARY || []).forEach((e) => {
    add({
      type: "glossary",
      title: e.term,
      text: stripTags(e.definition),
      extra: e.aliases.join(" "),
      url: `glossary.html#${e.id}`,
      tutorial: e.tutorial
    });
  });

  (window.MODULE3_NOTEBOOK_INDEX || []).forEach((h) => {
    add({
      type: "notebook",
      title: h.title,
      text: NOTEBOOK_NAMES[h.notebook] || h.notebook.replace(/_/g, " "),
      url: h.url,
      tutorial: h.tutorial
    });
  });

  const PAGE_READERS = {
    "tutorial-1.html": readTutorial,
    "tutorial-2.html": readTutorial,
    "tutorial-3.html": readTutorial,
    "tutorial-4.html": readTutorial,
    "resources.html": (doc) => {
      readResources(doc);
      readFiles(doc);
    },
    "people.html": readPeople
  };

  function readTutorial(doc, page) {
    const tutorial = Number(page.match(/\d/)[0]);
    const pageTitle = clean(doc.querySelector("h1"));
    doc.querySelectorAll("#conceptTable tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      add({
        type: "concept",
        title: clean(cells[1]),
        text: `${clean(cells[0])} · ${pageTitle}`,
        extra: row.dataset.search || "",
        url: `${page}#concepts`,
        tutorial
      });
    });
  }

  function readFiles(doc) {
    doc.querySelectorAll("tbody tr[data-type]").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const link = row.querySelector("a");
      if (!link) {
        return;
      }
      add({
        type: "file",
        title: clean(cells[1]),
        text: `${clean(cells[0])} · ${row.dataset.type}`,
        extra: row.dataset.search || "",
        url: link.getAttribute("href"),
        tutorial: Number(row.dataset.tutorial) || null
      });
    });
  }

  function readResources(doc) {
    doc.querySelectorAll(".card").forEach((card) => {
      const group = clean(card.querySelector("h3"));
      card.querySelectorAll("li a").forEach((link) => {
        add({ type: "resource", title: clean(link), text: group, url: link.getAttribute("href") });
      });
    });
  }

  function readPeople(doc) {
    const seen = new Set();
    doc.querySelectorAll(".contributors").forEach((card) => {
      const name = clean(card.querySelector(".focus-name span") || card.querySelector(".focus-name"));
      const role = clean(card.querySelector(".role-label"));
      const area = clean(card.querySelector("h3"));
      if (name && !seen.has(name)) {
        seen.add(name);
        add({ type: "person", title: name, text: `${role} · ${area}`, url: "people.html" });
      }
    });
    doc.querySelectorAll(".contributor-cards li").forEach((li) => {
      const name = clean(li);
      if (name && !seen.has(name)) {
        seen.add(name);
        const ta = li.closest(".ta-cards");
        add({ type: "person", title: name, text: ta ? "Teaching assistant" : "Notebook contributor", url: "people.html" });
      }
    });
  }

  async function loadPages() {
    const pages = Object.keys(PAGE_READERS);
    const loaded = await Promise.allSettled(
      pages.map((page) =>
        fetch(page).then((r) => {
          if (!r.ok) {
            throw new Error(r.statusText);
          }
          return r.text();
        })
      )
    );
    let failed = 0;
    loaded.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const doc = new DOMParser().parseFromString(result.value, "text/html");
        PAGE_READERS[pages[i]](doc, pages[i]);
      } else {
        failed += 1;
      }
    });
    pagesLoaded = failed === 0;
    return failed;
  }

  /* Searching -------------------------------------------------------- */

  function score(item, query, tokens) {
    if (!tokens.every((t) => item.haystack.includes(t))) {
      return 0;
    }
    let s = 1;
    if (item.titleNorm === query) {
      s += 20;
    } else if (item.titleNorm.startsWith(query)) {
      s += 10;
    } else if (item.titleNorm.includes(query)) {
      s += 6;
    }
    tokens.forEach((t) => {
      if (item.titleNorm.includes(t)) {
        s += 3;
      }
    });
    if (item.type === "glossary") {
      s += 2;
    }
    return s;
  }

  function highlight(text, tokens) {
    let html = escapeHtml(text);
    const sorted = [...tokens].sort((a, b) => b.length - a.length);
    sorted.forEach((t) => {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-–—]")})`, "gi");
      html = html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => (tag ? tag : txt.replace(re, "<mark>$1</mark>")));
    });
    return html;
  }

  function render() {
    const raw = input.value;
    const query = normalise(raw);
    const params = new URLSearchParams(location.search);
    if (query) {
      params.set("q", raw.trim());
    } else {
      params.delete("q");
    }
    history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);

    if (query.length < 2) {
      results.innerHTML = "";
      scopes.innerHTML = "";
      status.textContent = "Type at least two letters to search.";
      return;
    }
    const tokens = query.split(" ").filter(Boolean);
    const matches = items
      .map((item) => ({ item, s: score(item, query, tokens) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => b.s - a.s);

    const byType = new Map(TYPES.map((t) => [t.key, []]));
    matches.forEach((m) => byType.get(m.item.type).push(m.item));

    scopes.innerHTML = [
      `<button type="button" class="scope${activeScope === "" ? " is-active" : ""}" data-scope="">All <span>${matches.length}</span></button>`,
      ...TYPES.filter((t) => byType.get(t.key).length).map(
        (t) => `<button type="button" class="scope${activeScope === t.key ? " is-active" : ""}" data-scope="${t.key}">${t.label} <span>${byType.get(t.key).length}</span></button>`
      )
    ].join("");

    if (!matches.length) {
      status.textContent = `No results for “${raw.trim()}”. Try a shorter word or check the spelling.`;
      results.innerHTML = "";
      return;
    }
    status.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} for “${raw.trim()}”.`;

    results.innerHTML = TYPES.filter((t) => byType.get(t.key).length && (!activeScope || activeScope === t.key))
      .map((t) => {
        const list = byType.get(t.key);
        const limit = activeScope ? list.length : PER_GROUP;
        return `
          <div class="result-group">
            <h2>${t.label}</h2>
            <ul class="result-list">
              ${list.slice(0, limit).map((item) => `
                <li>
                  <a href="${escapeHtml(item.url)}">${highlight(item.title, tokens)}</a>
                  ${item.tutorial ? `<span class="pill">Tutorial ${item.tutorial}</span>` : ""}
                  <p>${highlight(item.text || "", tokens)}</p>
                </li>`).join("")}
            </ul>
            ${list.length > limit
              ? `<button type="button" class="button secondary small" data-scope="${t.key}">Show all ${list.length}</button>`
              : ""}
          </div>`;
      })
      .join("");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scope]");
    if (!button) {
      return;
    }
    activeScope = button.dataset.scope;
    render();
    if (activeScope) {
      window.scrollTo({ top: results.getBoundingClientRect().top + window.scrollY - 120 });
    }
  });

  document.getElementById("searchForm").addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", () => {
    activeScope = "";
    render();
  });

  input.value = new URLSearchParams(location.search).get("q") || "";
  input.focus();
  render();

  loadPages().then((failed) => {
    if (failed && !pagesLoaded) {
      status.insertAdjacentHTML(
        "afterend",
        `<p class="empty-note">Some pages could not be searched (${failed} of ${Object.keys(PAGE_READERS).length}). This happens when the site is opened from a file on your computer; on the website everything is searched.</p>`
      );
    }
    render();
  });
})();
