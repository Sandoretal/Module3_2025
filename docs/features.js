// Page features for the Module 3 site:
//   - "Today" banner on the home page, read live from schedule.html
//   - per-tutorial progress checklist (saved in the student's own browser)
//   - glossary links in the tutorial concept tables
//   - feedback and problem-report buttons on the tutorial pages
(() => {
  const REPO = "https://github.com/Sandoretal/Module3_2025";

  const store = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* storage unavailable (private window, blocked site data) */
      }
    }
  };

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const tutorialNumber = () => Number(document.body.dataset.tutorial) || null;

  /* ------------------------------------------------------------------ */
  /* Today banner                                                        */
  /* ------------------------------------------------------------------ */

  // For testing: index.html?now=2026-11-05T11:00 pretends it is that time.
  function currentTime() {
    const override = new URLSearchParams(location.search).get("now");
    const parsed = override ? new Date(override) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  }

  const localDate = (d) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");

  function parseSchedule(doc) {
    const sessions = [];
    doc.querySelectorAll(".schedule-day").forEach((day) => {
      const date = day.dataset.date;
      const dayName = (day.querySelector("h2") || {}).textContent || date;
      const dayLabel = (day.querySelector(".eyebrow") || {}).textContent || "";
      day.querySelectorAll("tbody tr").forEach((row) => {
        const cells = row.querySelectorAll("td");
        const time = (cells[0] && cells[0].textContent) || "";
        const match = time.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
        if (!match) {
          return;
        }
        const [, h1, m1, h2, m2] = match;
        const pad = (n) => String(n).padStart(2, "0");
        const text = (cell) => (cell ? cell.textContent.replace(/\s+/g, " ").trim() : "");
        const sessionCell = cells[1];
        const scratch = document.createElement("div");
        scratch.innerHTML = sessionCell.innerHTML.split(/<br\s*\/?>/i)[0];
        const link = sessionCell.querySelector("a");
        sessions.push({
          dayName: dayName.trim(),
          dayLabel: dayLabel.trim(),
          date,
          study: row.classList.contains("study-row"),
          start: new Date(`${date}T${pad(h1)}:${m1}:00`),
          end: new Date(`${date}T${pad(h2)}:${m2}:00`),
          time: `${pad(h1)}:${m1}–${pad(h2)}:${m2}`,
          title: text(scratch),
          type: text(cells[2]),
          room: text(cells[3]),
          lead: text(cells[4]),
          linkText: link ? link.textContent.trim() : "",
          linkHref: link ? link.getAttribute("href") : ""
        });
      });
    });
    return sessions.sort((a, b) => a.start - b.start);
  }

  function dayListHtml(daySessions, now) {
    const upcoming = daySessions.find((s) => !s.study && s.start > now);
    return daySessions.map((s) => {
      let status = "later";
      let label = s.time.split("–")[0];
      if (s.end <= now) {
        status = "done";
        label = "Done";
      } else if (s.start <= now) {
        status = "now";
        label = "Now";
      } else if (s === upcoming) {
        status = "next";
        label = "Next";
      }
      const link = s.linkHref ? ` <a href="${escapeHtml(s.linkHref)}">${escapeHtml(s.linkText)}</a>` : "";
      const details = [s.time];
      if (s.room && s.room !== "–") {
        details.push(s.room);
      }
      if (s.lead && s.lead !== "–") {
        details.push(`led by ${s.lead}`);
      }
      return `
        <li class="today-item is-${status}${s.study ? " is-study" : ""}">
          <span class="today-label">${escapeHtml(label)}</span>
          <div>
            <strong>${escapeHtml(s.title)}</strong>${link}
            <p>${details.map(escapeHtml).join(" · ")}</p>
          </div>
        </li>`;
    }).join("");
  }

  async function initTodayBanner() {
    const box = document.getElementById("todayBanner");
    if (!box) {
      return;
    }
    let sessions;
    try {
      const response = await fetch("schedule.html", { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      sessions = parseSchedule(new DOMParser().parseFromString(await response.text(), "text/html"));
    } catch (error) {
      sessions = [];
    }
    if (!sessions.length) {
      // The schedule could not be read (e.g. the page was opened from a file
      // on this computer, where browsers block it). Point to the timetable.
      box.innerHTML = `
        <div class="section-head">
          <div>
            <span class="eyebrow">Schedule</span>
            <h2>What's on today</h2>
          </div>
          <a class="button secondary small" href="schedule.html">Full timetable</a>
        </div>
        <p class="today-note">Today's sessions appear here on the module website. Open the
          <a href="schedule.html">timetable</a> to see every session.</p>`;
      box.hidden = false;
      return;
    }

    const now = currentTime();
    const today = localDate(now);
    const last = sessions[sessions.length - 1];
    const daysUntil = (date) =>
      Math.round((new Date(`${date}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
    const sessionsOn = (date) => sessions.filter((s) => s.date === date);
    let heading;
    let body;

    if (now >= last.end) {
      heading = "Module 3 has finished";
      body = `<p class="today-note">All materials stay available on the tutorial pages.</p>`;
    } else if (sessionsOn(today).length) {
      const todays = sessionsOn(today);
      const dayOver = todays.every((s) => s.end <= now);
      heading = dayOver
        ? `Today's sessions are over`
        : `Today: ${todays[0].dayName}`;
      body = `<ol class="today-list">${dayListHtml(todays, now)}</ol>`;
      if (dayOver) {
        const nextDay = sessions.find((s) => s.start > now);
        if (nextDay) {
          body += `<p class="today-note">Next: ${escapeHtml(nextDay.dayName)}, starting ${escapeHtml(nextDay.time.split("–")[0])}.</p>`;
        }
      }
    } else {
      const nextDay = sessions.find((s) => s.start > now).date;
      const n = daysUntil(nextDay);
      const when = n === 1 ? "tomorrow" : `in ${n} days`;
      const dayName = sessionsOn(nextDay)[0].dayName;
      heading = now < sessions[0].start
        ? `Module 3 starts ${when}: ${dayName}`
        : `No sessions today. Next ${when}: ${dayName}`;
      body = `<ol class="today-list">${dayListHtml(sessionsOn(nextDay), now)}</ol>`;
    }

    box.innerHTML = `
      <div class="section-head">
        <div>
          <span class="eyebrow">Schedule</span>
          <h2>${heading}</h2>
        </div>
        <a class="button secondary small" href="schedule.html">Full timetable</a>
      </div>
      ${body}`;
    box.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* Progress checklist                                                  */
  /* ------------------------------------------------------------------ */

  function initChecklist() {
    const n = tutorialNumber();
    const table = document.getElementById("conceptTable");
    if (!n || !table) {
      return;
    }
    const key = `module3-2025-progress-tutorial-${n}`;
    const done = new Set(store.get(key, []));
    const rows = Array.from(table.querySelectorAll("tr"));
    const headRow = table.closest("table").querySelector("thead tr");
    headRow.insertAdjacentHTML("afterbegin", '<th class="done-col">Done</th>');

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.innerHTML = `
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${rows.length}" aria-label="Your progress in this tutorial">
        <span></span>
      </div>
      <p class="progress-text"></p>
      <button type="button" class="button secondary small progress-reset">Clear ticks</button>`;
    table.closest(".table-wrap").before(progress);

    const update = () => {
      const count = rows.filter((row) => done.has(row.dataset.key)).length;
      progress.querySelector(".progress-bar").setAttribute("aria-valuenow", String(count));
      progress.querySelector(".progress-bar span").style.width = `${(count / rows.length) * 100}%`;
      progress.querySelector(".progress-text").textContent =
        count === rows.length
          ? `All ${rows.length} parts done. Well done!`
          : `${count} of ${rows.length} parts done. Your ticks are saved in this browser only.`;
      progress.querySelector(".progress-reset").hidden = count === 0;
    };

    rows.forEach((row, index) => {
      row.dataset.key = row.dataset.search || `row-${index}`;
      const concept = row.querySelectorAll("td")[1];
      const label = concept ? concept.textContent.trim() : `part ${index + 1}`;
      const cell = document.createElement("td");
      cell.className = "done-col";
      cell.innerHTML = `<input type="checkbox" class="done-box" aria-label="Mark as done: ${escapeHtml(label)}">`;
      row.prepend(cell);
      const box = cell.querySelector("input");
      box.checked = done.has(row.dataset.key);
      row.classList.toggle("is-done", box.checked);
      box.addEventListener("change", () => {
        if (box.checked) {
          done.add(row.dataset.key);
        } else {
          done.delete(row.dataset.key);
        }
        row.classList.toggle("is-done", box.checked);
        store.set(key, Array.from(done));
        update();
      });
    });

    progress.querySelector(".progress-reset").addEventListener("click", () => {
      done.clear();
      store.set(key, []);
      rows.forEach((row) => {
        row.classList.remove("is-done");
        row.querySelector(".done-box").checked = false;
      });
      update();
    });

    update();
  }

  /* ------------------------------------------------------------------ */
  /* Glossary links in the concept tables                                */
  /* ------------------------------------------------------------------ */

  function initGlossaryLinks() {
    const glossary = window.MODULE3_GLOSSARY;
    const table = document.getElementById("conceptTable");
    if (!glossary || !table) {
      return;
    }
    // Longest names first, so "Mann–Whitney U" wins over "U".
    const names = [];
    glossary.forEach((entry) => {
      [entry.term, ...entry.aliases].forEach((name) => {
        if (name.length >= 2) {
          names.push({ name, entry });
        }
      });
    });
    names.sort((a, b) => b.name.length - a.name.length);
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(^|[^\\w.])(${names.map((n) => escapeRe(n.name)).join("|")})(?![\\w])`,
      "i"
    );
    const lookup = new Map(names.map((n) => [n.name.toLowerCase(), n.entry]));
    const linked = new Set();

    table.querySelectorAll("tr").forEach((row) => {
      const cell = row.querySelectorAll("td")[2]; // concept description (after the Done column)
      if (!cell) {
        return;
      }
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement.closest("a, code")) {
          textNodes.push(walker.currentNode);
        }
      }
      textNodes.forEach((node) => {
        let rest = node;
        let match;
        while (rest && (match = pattern.exec(rest.textContent))) {
          const entry = lookup.get(match[2].toLowerCase());
          const start = match.index + match[1].length;
          if (!entry || linked.has(entry.id)) {
            // Skip this occurrence and keep searching after it.
            const after = rest.splitText(start + match[2].length);
            rest = after;
            continue;
          }
          linked.add(entry.id);
          const word = rest.splitText(start);
          rest = word.splitText(match[2].length);
          const link = document.createElement("a");
          link.className = "gloss-link";
          link.href = `glossary.html#${entry.id}`;
          link.title = `${entry.term}: ${entry.definition.replace(/<[^>]+>/g, "")}`;
          link.textContent = word.textContent;
          word.replaceWith(link);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Feedback                                                            */
  /* ------------------------------------------------------------------ */

  function issueUrl(template, fields) {
    const params = new URLSearchParams({ template, ...fields });
    return `${REPO}/issues/new?${params.toString()}`;
  }

  function initFeedback() {
    const n = tutorialNumber();
    const footer = document.querySelector("footer");
    if (!n || !footer) {
      return;
    }
    const tutorial = `Tutorial ${n}`;
    const lead = document.querySelector(".contributors a.focus-name[href^='mailto:']");
    const email = lead ? lead.getAttribute("href").replace(/^mailto:/, "") : "";
    const leadName = lead ? lead.textContent.trim() : "the tutorial lead";
    const mail = (subject) =>
      `mailto:${email}?subject=${encodeURIComponent(`${tutorial}: ${subject}`)}`;

    const section = document.createElement("section");
    section.className = "section feedback";
    section.innerHTML = `
      <div class="section-head">
        <div>
          <span class="eyebrow">Feedback</span>
          <h2>Feedback and problems</h2>
          <p class="section-note">Both buttons create an issue on GitHub with this tutorial already filled in.
            Write your comment, then press <strong>Create</strong>.</p>
        </div>
      </div>
      <div class="feedback-row">
        <a class="button secondary" target="_blank" rel="noopener"
           href="${escapeHtml(issueUrl("tutorial-feedback.yml", { title: `[${tutorial}] Feedback`, tutorial }))}">Give feedback</a>
        <a class="button primary" target="_blank" rel="noopener"
           href="${escapeHtml(issueUrl("problem-report.yml", { title: `[${tutorial}] Problem: `, tutorial }))}">Report a problem</a>
      </div>
      <p class="feedback-alt">No GitHub account?
        ${email
          ? `<a href="${escapeHtml(mail("feedback"))}">Email ${escapeHtml(leadName)}</a> instead.`
          : "Tell your tutorial lead or a GTA in the session."}
      </p>`;
    footer.before(section);
  }

  /* ------------------------------------------------------------------ */
  /* Download icons next to each notebook and dataset                    */
  /* ------------------------------------------------------------------ */

  // Browsers ignore the download attribute for files on another site
  // (GitHub), so fetch the file and save it. If that fails, the link simply
  // opens the raw file, which can be saved with Cmd/Ctrl+S.
  function initDownloads() {
    document.addEventListener("click", async (event) => {
      const link = event.target.closest("a.download-icon[data-download]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      link.classList.add("is-busy");
      try {
        const response = await fetch(link.href);
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        const url = URL.createObjectURL(await response.blob());
        const save = document.createElement("a");
        save.href = url;
        save.download = link.dataset.download;
        document.body.appendChild(save);
        save.click();
        save.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (error) {
        window.open(link.href, "_blank", "noopener");
      } finally {
        link.classList.remove("is-busy");
      }
    });
  }

  /* ------------------------------------------------------------------ */

  function init() {
    initTodayBanner();
    initChecklist();
    initGlossaryLinks();
    initFeedback();
    initDownloads();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
