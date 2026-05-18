/**
 * Parses CSV text into named raw rows using the first non-empty row as headers.
 */
export function parseCsv(text) {
  const records = parseCsvRecords(String(text ?? ""));
  const headerRecord = records.find((record) => !isBlankRecord(record));

  if (!headerRecord) {
    throw new Error("CSV file is missing a header row.");
  }

  const headerIndex = records.indexOf(headerRecord);
  const headers = headerRecord.map((header, index) => {
    const value = index === 0 ? stripByteOrderMark(header) : header;

    return String(value ?? "").trim();
  });

  if (headers.some((header) => !header)) {
    throw new Error("CSV header row contains an empty column name.");
  }

  const rows = records
    .slice(headerIndex + 1)
    .map((record, index) => ({
      rowNumber: headerIndex + index + 2,
      raw: recordToObject(headers, record),
    }))
    .filter((row) => !isBlankRawRow(row.raw));

  return { headers, rows };
}

/**
 * Splits CSV text into records while preserving quoted commas and newlines.
 */
export function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";

      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV file contains an unterminated quoted field.");
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Converts one positional CSV record into an object keyed by header name.
 */
function recordToObject(headers, record) {
  return headers.reduce((row, header, index) => {
    row[header] = record[index] ?? "";
    return row;
  }, {});
}

/**
 * Checks whether a parsed CSV record contains no useful cell values.
 */
function isBlankRecord(record) {
  return record.every((field) => String(field ?? "").trim() === "");
}

/**
 * Checks whether an object-style CSV row has no useful field values.
 */
function isBlankRawRow(raw) {
  return Object.values(raw).every((value) => String(value ?? "").trim() === "");
}

/**
 * Removes the UTF byte-order marker sometimes found at the start of CSV files.
 */
function stripByteOrderMark(value) {
  return String(value ?? "").replace(/^\uFEFF/u, "");
}
