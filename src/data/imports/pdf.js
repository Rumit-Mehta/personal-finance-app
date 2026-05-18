/**
 * Extracts ordered text from a PDF file in the browser without uploading it.
 */
export async function extractPdfText(file) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  const bytes = new Uint8Array(await file.arrayBuffer());

  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();

    pages.push(textFromItems(textContent.items));
  }

  return {
    pageCount: document.numPages,
    pages,
    text: pages.join("\n\n"),
  };
}

function textFromItems(items) {
  const rows = [];

  items
    .filter((item) => text(item.str))
    .map((item) => ({
      text: text(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x)
    .forEach((item) => {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);

      if (row) {
        row.items.push(item);
        return;
      }

      rows.push({ y: item.y, items: [item] });
    });

  return rows
    .map((row) =>
      row.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function text(value) {
  return String(value ?? "").trim();
}
