function getExpandedHeaders(row) {
  const headers = [];

  Array.from(row.cells).forEach(cell => {
    const text = cell.textContent.replace(/\s+/g, " ").trim();
    const span = Number(cell.colSpan) || 1;

    for (let index = 0; index < span; index += 1) {
      headers.push(text);
    }
  });

  return headers;
}

function enhanceTable(table) {
  if (table.dataset.mobileCardsReady === "true") {
    return;
  }

  const headRow = table.tHead && table.tHead.rows[0];
  if (!headRow) {
    return;
  }

  const headers = getExpandedHeaders(headRow);
  if (!headers.length) {
    return;
  }

  const bodyRows = Array.from(table.tBodies).flatMap(section => Array.from(section.rows));
  if (!bodyRows.length) {
    return;
  }

  bodyRows.forEach(row => {
    Array.from(row.cells).forEach((cell, index) => {
      const label = headers[index] || headers[headers.length - 1] || "";
      if (label) {
        cell.dataset.label = label;
      }
    });
  });

  const wrap = table.closest(".table-wrap");
  if (wrap) {
    wrap.classList.add("is-cardified");
  }

  table.dataset.mobileCardsReady = "true";
}

function enhanceTables(root = document) {
  root.querySelectorAll(".table-wrap table").forEach(enhanceTable);
}

document.addEventListener("DOMContentLoaded", () => {
  enhanceTables();

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        if (node.matches(".table-wrap table")) {
          enhanceTable(node);
          continue;
        }

        if (node.querySelector(".table-wrap table")) {
          enhanceTables(node);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
