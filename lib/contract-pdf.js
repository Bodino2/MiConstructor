import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const WORK_CONTRACT_TEMPLATE_VERSION = "ES-OBRA-2026-08-v1";

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateWorkContractPdf(contract) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const steel = rgb(0.11, 0.21, 0.36);
  const brick = rgb(0.83, 0.33, 0);
  const muted = rgb(0.36, 0.42, 0.47);
  const pageSize = [595.28, 841.89];
  const margin = 54;
  let page = document.addPage(pageSize);
  let y = 782;

  function drawHeader() {
    page.drawRectangle({ x: 0, y: 817, width: pageSize[0], height: 25, color: steel });
    page.drawText("MI CONSTRUCTOR", { x: margin, y: 825, font: bold, size: 9, color: rgb(1, 1, 1) });
    page.drawText(`Contrato ${contract.reference}`, { x: 410, y: 825, font: regular, size: 7, color: rgb(1, 1, 1) });
  }

  function addPage() {
    page = document.addPage(pageSize);
    y = 782;
    drawHeader();
  }

  function ensureSpace(height) {
    if (y - height < 55) addPage();
  }

  function paragraph(text, options = {}) {
    const size = options.size ?? 9.5;
    const lineHeight = options.lineHeight ?? 14;
    const font = options.bold ? bold : regular;
    const lines = wrapText(text, font, size, pageSize[0] - margin * 2);
    ensureSpace(lines.length * lineHeight + 8);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, font, size, color: options.color ?? muted });
      y -= lineHeight;
    }
    y -= 6;
  }

  function heading(index, title) {
    ensureSpace(35);
    page.drawText(String(index).padStart(2, "0"), { x: margin, y, font: bold, size: 8, color: brick });
    page.drawText(title.toUpperCase(), { x: margin + 28, y, font: bold, size: 10, color: steel });
    y -= 22;
  }

  drawHeader();
  page.drawText("CONTRATO DE EJECUCIÓN DE OBRA", { x: margin, y, font: bold, size: 19, color: steel });
  y -= 24;
  page.drawText("Modelo marco editable generado al aceptar el presupuesto", { x: margin, y, font: regular, size: 9, color: muted });
  y -= 34;

  heading(1, "Partes");
  paragraph(`Cliente: ${contract.client.name}, NIF/NIE ${contract.client.taxId}, ${contract.client.email}.`);
  paragraph(`Profesional: ${contract.professional.companyName || contract.professional.name}, NIF/CIF ${contract.professional.taxId}, representado por ${contract.professional.name}, ${contract.professional.email}.`);

  heading(2, "Objeto y ubicación");
  paragraph(`El profesional ejecutará el proyecto «${contract.project.title}», categoría ${contract.project.category}, en ${contract.project.location}, conforme al alcance descrito en el presupuesto aceptado.`);

  heading(3, "Presupuesto aceptado");
  const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  for (const item of contract.items) {
    ensureSpace(18);
    page.drawText(`${item.category} · ${item.description}`, { x: margin, y, font: regular, size: 8, color: muted });
    page.drawText(money.format(item.totalCents / 100), { x: 470, y, font: bold, size: 8, color: steel });
    y -= 15;
  }
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: 541, y }, thickness: 0.7, color: rgb(0.82, 0.85, 0.87) });
  y -= 18;
  page.drawText(`TOTAL: ${money.format(contract.quote.totalCents / 100)}`, { x: 380, y, font: bold, size: 11, color: steel });
  y -= 28;

  heading(4, "Hitos, evidencias y pagos");
  paragraph("La ejecución se divide en hitos. Antes de solicitar la revisión de un hito, el profesional incorporará al Diario de Obra las evidencias fotográficas o audiovisuales y la documentación técnica aplicable. El cliente revisará el resultado antes de autorizar la liberación de fondos.");

  heading(5, "Cambios de alcance");
  paragraph("Cualquier modificación de alcance, precio o plazo deberá documentarse y aceptarse por ambas partes dentro de MiConstructor antes de ejecutarse. Los acuerdos verbales no modifican este contrato.");

  heading(6, "Responsabilidad y seguro");
  paragraph("El profesional declara que mantendrá vigentes las habilitaciones y coberturas de responsabilidad civil exigibles para los trabajos contratados. El badge Asegurado solo acredita la revisión documental realizada por la plataforma en la fecha indicada.");

  heading(7, "Protección de datos y comunicaciones");
  paragraph("Las partes utilizarán los canales de MiConstructor para conservar la trazabilidad del proyecto. El tratamiento de datos se regirá por la política de privacidad aceptada y por la normativa aplicable.");

  heading(8, "Aceptación");
  paragraph("Este documento es un modelo contractual generado a partir de los datos del proyecto y del presupuesto. Las partes deberán revisar sus cláusulas y completar, cuando proceda, anexos técnicos, licencias, plazos, garantías y condiciones particulares antes de la firma.");
  y -= 8;
  ensureSpace(70);
  page.drawRectangle({ x: margin, y: y - 38, width: 215, height: 50, borderWidth: 0.8, borderColor: rgb(0.76, 0.8, 0.83) });
  page.drawRectangle({ x: 326, y: y - 38, width: 215, height: 50, borderWidth: 0.8, borderColor: rgb(0.76, 0.8, 0.83) });
  page.drawText("ACEPTACIÓN DEL CLIENTE", { x: margin + 12, y, font: bold, size: 7, color: steel });
  page.drawText("ACEPTACIÓN DEL PROFESIONAL", { x: 338, y, font: bold, size: 7, color: steel });

  const pages = document.getPages();
  pages.forEach((item, index) => {
    item.drawText(`MiConstructor · ${WORK_CONTRACT_TEMPLATE_VERSION}`, { x: margin, y: 28, font: regular, size: 6, color: muted });
    item.drawText(`Página ${index + 1} de ${pages.length}`, { x: 487, y: 28, font: regular, size: 6, color: muted });
  });
  document.setTitle(`Contrato de obra - ${contract.project.title}`);
  document.setSubject("Contrato marco de ejecución de obra generado por MiConstructor");
  document.setCreator("MiConstructor");
  return document.save();
}
