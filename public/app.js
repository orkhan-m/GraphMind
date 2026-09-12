const chatEl = document.getElementById("chat");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("question");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal Markdown -> HTML renderer covering what the agent typically
// produces: headers, bold/italic, tables, bullet/numbered lists, paragraphs.
function renderMarkdown(raw) {
  const lines = escapeHtml(raw).split("\n");
  const htmlParts = [];
  let i = 0;

  const inline = (text) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  while (i < lines.length) {
    const line = lines[i];

    // Table: a header row, a separator row (---|---), then data rows.
    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      lines[i + 1] &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
    ) {
      const headerCells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim()),
        );
        i++;
      }
      let table = "<table><thead><tr>";
      table += headerCells.map((c) => `<th>${inline(c)}</th>`).join("");
      table += "</tr></thead><tbody>";
      for (const row of rows) {
        table +=
          "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      }
      table += "</tbody></table>";
      htmlParts.push(table);
      continue;
    }

    // Headers
    const headerMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length + 2, 6); // ### -> h5-ish
      htmlParts.push(`<h${level}>${inline(headerMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      htmlParts.push(
        "<ul>" + items.map((it) => `<li>${inline(it)}</li>`).join("") + "</ul>",
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-blank, non-special lines)
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    htmlParts.push(`<p>${inline(paraLines.join(" "))}</p>`);
  }

  return htmlParts.join("\n");
}

function addMessage(text, role) {
  const el = document.createElement("div");
  el.className = `msg msg--${role}`;
  if (role === "agent") {
    el.innerHTML = renderMarkdown(text);
  } else {
    el.textContent = text;
  }
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = inputEl.value.trim();
  if (!question) return;

  addMessage(question, "user");
  inputEl.value = "";
  inputEl.disabled = true;
  formEl.querySelector("button").disabled = true;

  const pending = addMessage("Researching onchain data...", "pending");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    pending.remove();
    if (!res.ok) {
      addMessage(data.error || "Something went wrong.", "error");
    } else {
      addMessage(data.answer, "agent");
    }
  } catch (err) {
    pending.remove();
    addMessage(`Request failed: ${err.message}`, "error");
  } finally {
    inputEl.disabled = false;
    formEl.querySelector("button").disabled = false;
    inputEl.focus();
  }
});
