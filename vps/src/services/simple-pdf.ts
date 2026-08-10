function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function wrap(text: string, width = 88) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function buildTextPdf(title: string, sections: Array<{ heading: string; body: string[] }>) {
  const allLines: Array<{ text: string; bold?: boolean }> = [{ text: title, bold: true }, { text: "" }];
  for (const section of sections) {
    allLines.push({ text: section.heading, bold: true });
    for (const paragraph of section.body) {
      for (const line of wrap(paragraph)) allLines.push({ text: line });
      allLines.push({ text: "" });
    }
  }

  const pageSize = 46;
  const pages: Array<Array<{ text: string; bold?: boolean }>> = [];
  for (let i = 0; i < allLines.length; i += pageSize) pages.push(allLines.slice(i, i + pageSize));

  const objects: string[] = [];
  const addObject = (body: string) => { objects.push(body); return objects.length; };
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  for (const page of pages) {
    let y = 800;
    const commands: string[] = ["BT", "/F1 10 Tf", "50 800 Td"];
    for (const line of page) {
      commands.push(`${line.bold ? "/F2 11 Tf" : "/F1 10 Tf"}`);
      commands.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line.text)}) Tj`);
      y -= line.bold ? 18 : 15;
    }
    commands.push("ET");
    const stream = commands.join("\n");
    contentObjectIds.push(addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
    pageObjectIds.push(addObject("PENDING_PAGE"));
  }

  const pagesObjectId = addObject("PENDING_PAGES");
  for (let i = 0; i < pageObjectIds.length; i++) {
    objects[pageObjectIds[i] - 1] = `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObjectIds[i]} 0 R >>`;
  }
  objects[pagesObjectId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}
