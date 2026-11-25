import PDFDocument from 'pdfkit';
import { qrCodePng } from './qrcode';

export interface SummaryMetric {
  label: string;
  value: string;
}

export interface SummaryDocument {
  title: string;
  subtitle?: string;
  metrics: SummaryMetric[];
  /** Body paragraphs. */
  paragraphs?: string[];
  /** Encoded as a QR code in the footer, e.g. a link back to the live report. */
  qrCodeUrl?: string;
}

const MARGIN = 48;
const BRAND = '#1d4ed8';
const MUTED = '#6b7280';
const METRICS_PER_ROW = 3;
const METRIC_HEIGHT = 64;
const METRIC_GAP = 12;

/**
 * Draws a one-page summary with PDFKit. PDFKit is imperative — you position
 * every element yourself — which suits free-form layouts such as letters,
 * certificates and cover pages. For tables see ./pdf-table.ts.
 */
export async function buildSummaryPdf(document: SummaryDocument): Promise<Buffer> {
  // Rendering the QR code is asynchronous, so do it before drawing starts.
  const qrCode = document.qrCodeUrl ? await qrCodePng(document.qrCodeUrl) : null;

  const pdf = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: document.title, Creator: 'BossByte' },
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const contentWidth = pdf.page.width - MARGIN * 2;

  // Header band
  pdf.rect(0, 0, pdf.page.width, 96).fill(BRAND);
  pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(document.title, MARGIN, 30);
  if (document.subtitle) pdf.font('Helvetica').fontSize(10).text(document.subtitle, MARGIN, 60);

  // Metric cards
  const cardWidth = (contentWidth - METRIC_GAP * (METRICS_PER_ROW - 1)) / METRICS_PER_ROW;
  let bottom = 124;
  document.metrics.forEach((metric, index) => {
    const x = MARGIN + (index % METRICS_PER_ROW) * (cardWidth + METRIC_GAP);
    const y = 124 + Math.floor(index / METRICS_PER_ROW) * (METRIC_HEIGHT + METRIC_GAP);
    pdf.roundedRect(x, y, cardWidth, METRIC_HEIGHT, 6).fillAndStroke('#f9fafb', '#e5e7eb');
    pdf
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(metric.label, x + 12, y + 12);
    pdf
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(metric.value, x + 12, y + 30, { width: cardWidth - 24, lineBreak: false });
    bottom = y + METRIC_HEIGHT;
  });

  // Body text
  pdf.fillColor('#111827').font('Helvetica').fontSize(11);
  let y = bottom + 28;
  for (const paragraph of document.paragraphs ?? []) {
    pdf.text(paragraph, MARGIN, y, { width: contentWidth, lineGap: 3 });
    y = pdf.y + 12;
  }

  // Footer
  const footerY = pdf.page.height - MARGIN - 72;
  if (qrCode && document.qrCodeUrl) {
    pdf.image(qrCode, MARGIN, footerY, { width: 72 });
    pdf
      .fillColor(MUTED)
      .fontSize(8)
      .text('Scan to open the live report', MARGIN + 84, footerY + 24)
      .fillColor(BRAND)
      .text(document.qrCodeUrl, MARGIN + 84, footerY + 38, { link: document.qrCodeUrl });
  }

  pdf.end();
  return finished;
}
