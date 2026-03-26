import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_EXTRACTED_CHARS = 5000;
const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

export type InboundMediaType = 'photo' | 'video' | 'audio' | 'document' | 'voice';

export interface MediaUnderstandingResult {
  extractedText?: string;
  extractionMethod?: string;
  extractionError?: string;
}

export async function saveInboundMediaBuffer(params: {
  data: Buffer;
  filenameHint?: string;
  mimeType?: string;
  prefix?: string;
}): Promise<{ localPath: string; filename: string }> {
  if (!Buffer.isBuffer(params.data) || params.data.length === 0) {
    throw new Error('Empty media buffer');
  }
  if (params.data.length > MAX_BUFFER_BYTES) {
    throw new Error(`Media too large (${params.data.length} bytes)`);
  }

  const baseName = sanitizeFilename(params.filenameHint || `media-${Date.now()}`);
  const ext = path.extname(baseName) || extensionFromMime(params.mimeType) || '.bin';
  const finalName = path.extname(baseName) ? baseName : `${baseName}${ext}`;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), `${params.prefix || 'foxfang-media'}-`));
  const localPath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${finalName}`);
  await writeFile(localPath, params.data);

  return { localPath, filename: finalName };
}

export async function analyzeInboundMedia(params: {
  localPath: string;
  type: InboundMediaType;
  filename?: string;
  mimeType?: string;
}): Promise<MediaUnderstandingResult> {
  const fileName = (params.filename || path.basename(params.localPath)).toLowerCase();
  const mime = (params.mimeType || '').toLowerCase();
  const ext = path.extname(fileName).toLowerCase();

  try {
    if (params.type === 'photo' || isImageType(ext, mime)) {
      const text = await extractImageTextWithTesseract(params.localPath);
      if (text) {
        return {
          extractedText: truncateForContext(text),
          extractionMethod: 'tesseract-ocr',
        };
      }
      return {
        extractionMethod: 'tesseract-ocr',
        extractionError: 'No readable text detected in image',
      };
    }

    if (ext === '.pdf' || mime === 'application/pdf') {
      const text = await extractPdfText(params.localPath);
      return {
        extractedText: truncateForContext(text),
        extractionMethod: 'pdftotext',
      };
    }

    if (ext === '.docx') {
      const text = await extractDocxText(params.localPath);
      return {
        extractedText: truncateForContext(text),
        extractionMethod: 'docx-unzip-xml',
      };
    }

    if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
      const text = await extractXlsxText(params.localPath);
      return {
        extractedText: truncateForContext(text),
        extractionMethod: 'xlsx-unzip-xml',
      };
    }

    if (isTextLike(ext, mime)) {
      const content = await readFile(params.localPath, 'utf-8');
      return {
        extractedText: truncateForContext(content),
        extractionMethod: 'plain-text',
      };
    }

    return {
      extractionError: `Unsupported media type for content extraction (${ext || mime || params.type})`,
    };
  } catch (error) {
    return {
      extractionError: error instanceof Error ? error.message : String(error),
    };
  }
}

function sanitizeFilename(value: string): string {
  const base = value.trim() || 'file';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

function extensionFromMime(mimeType?: string): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  if (mime.startsWith('text/')) return '.txt';
  return '';
}

function isImageType(ext: string, mime: string): boolean {
  if (mime.startsWith('image/')) return true;
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(ext);
}

function isTextLike(ext: string, mime: string): boolean {
  if (mime.startsWith('text/')) return true;
  return ['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml', '.html', '.log'].includes(ext);
}

async function extractPdfText(localPath: string): Promise<string> {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', '-q', localPath, '-'], {
    timeout: 20000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return normalizeWhitespace(stdout || '');
}

async function extractDocxText(localPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', localPath, 'word/document.xml'], {
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const xml = stdout || '';
  if (!xml.trim()) return '';
  const withParagraphBreaks = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t');
  const text = withParagraphBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeXmlEntities(text));
}

async function extractXlsxText(localPath: string): Promise<string> {
  const listResult = await execFileAsync('unzip', ['-Z1', localPath], {
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const entries = (listResult.stdout || '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const sharedStrings = await readXlsxSharedStrings(localPath, entries);
  const sheets = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry))
    .slice(0, 3);

  const lines: string[] = [];
  for (const sheet of sheets) {
    const { stdout } = await execFileAsync('unzip', ['-p', localPath, sheet], {
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const sheetText = parseSheetXml(stdout || '', sharedStrings);
    if (sheetText) {
      lines.push(`[${path.basename(sheet, '.xml')}]`);
      lines.push(sheetText);
    }
  }

  return normalizeWhitespace(lines.join('\n'));
}

async function readXlsxSharedStrings(localPath: string, entries: string[]): Promise<string[]> {
  if (!entries.includes('xl/sharedStrings.xml')) {
    return [];
  }
  const { stdout } = await execFileAsync('unzip', ['-p', localPath, 'xl/sharedStrings.xml'], {
    timeout: 15000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const xml = stdout || '';
  if (!xml.trim()) return [];

  const out: string[] = [];
  const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const tMatches = si.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g) || [];
    const text = tMatches
      .map((tTag) => {
        const m = tTag.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
        return m?.[1] || '';
      })
      .join('');
    out.push(decodeXmlEntities(text));
  }
  return out;
}

function parseSheetXml(xml: string, sharedStrings: string[]): string {
  const rows = xml.match(/<row[\s\S]*?<\/row>/g) || [];
  const lines: string[] = [];

  for (const row of rows.slice(0, 80)) {
    const cells = row.match(/<c[\s\S]*?<\/c>/g) || [];
    const values: string[] = [];
    for (const cell of cells) {
      const typeMatch = cell.match(/\bt="([^"]+)"/);
      const cellType = typeMatch?.[1] || '';
      const vMatch = cell.match(/<v>([\s\S]*?)<\/v>/);
      const inlineMatch = cell.match(/<is>[\s\S]*?<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);

      let value = '';
      if (cellType === 's' && vMatch?.[1]) {
        const index = Number.parseInt(vMatch[1], 10);
        value = Number.isFinite(index) ? sharedStrings[index] || '' : '';
      } else if (inlineMatch?.[1]) {
        value = decodeXmlEntities(inlineMatch[1]);
      } else if (vMatch?.[1]) {
        value = decodeXmlEntities(vMatch[1]);
      }

      value = value.trim();
      if (value) values.push(value);
    }
    if (values.length > 0) {
      lines.push(values.join(' | '));
    }
  }

  return lines.join('\n');
}

async function extractImageTextWithTesseract(localPath: string): Promise<string> {
  const { stdout } = await execFileAsync('tesseract', [localPath, 'stdout', '-l', 'eng'], {
    timeout: 25000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return normalizeWhitespace(stdout || '');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#9;/g, '\t');
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateForContext(value: string): string {
  if (value.length <= MAX_EXTRACTED_CHARS) return value;
  return `${value.slice(0, MAX_EXTRACTED_CHARS)}\n...[truncated]`;
}
