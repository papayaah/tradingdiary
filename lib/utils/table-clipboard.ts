/** Copy the displayed cells as both a document table and spreadsheet-friendly text. */
export async function copyTableToClipboard(table: HTMLTableElement): Promise<void> {
  const rows = Array.from(table.rows, (row) =>
    Array.from(row.cells, (cell) => ({
      isHeader: cell.tagName === 'TH',
      text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })),
  );
  const text = rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n');

  if (!navigator.clipboard) {
    throw new Error('Clipboard access is unavailable.');
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    // Rebuild from text so app styling, chart highlights, and event handlers
    // never become part of the pasted table.
    const cleanTable = document.createElement('table');
    cleanTable.style.borderCollapse = 'collapse';
    cleanTable.setAttribute('border', '1');
    cleanTable.setAttribute('cellpadding', '6');
    const head = cleanTable.createTHead();
    const body = cleanTable.createTBody();

    for (const row of rows) {
      const cleanRow = (row.every((cell) => cell.isHeader) ? head : body).insertRow();
      for (const cell of row) {
        const cleanCell = document.createElement(cell.isHeader ? 'th' : 'td');
        if (cell.isHeader) cleanCell.setAttribute('scope', 'col');
        cleanCell.textContent = cell.text;
        cleanRow.appendChild(cleanCell);
      }
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([cleanTable.outerHTML], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      // Some browsers permit text copying but reject rich clipboard formats.
    }
  }

  await navigator.clipboard.writeText(text);
}
