import { open } from 'node:fs/promises';
import { extname } from 'node:path';

const PDF = Buffer.from('%PDF-');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_ENTRY = 'word/document.xml';
// the ZIP central directory (entry names) sits at the end of the file
const TAIL_BYTES = 1024 * 1024;

// the extension decides the type, the content must agree
export function matchFileType(
    ext: string,
    head: Buffer,
    tail: Buffer,
): string | null {
    const zip = head.subarray(0, 4).equals(ZIP);
    switch (ext) {
        case '.pdf':
            return head.subarray(0, 5).equals(PDF) ? 'application/pdf' : null;
        case '.zip':
            return zip ? 'application/zip' : null;
        case '.docx':
            return zip && tail.includes(DOCX_ENTRY)
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : null;
        default:
            return null;
    }
}

export async function detectFileType(path: string, originalName: string) {
    const ext = extname(originalName).toLowerCase();
    const file = await open(path);
    try {
        const { size } = await file.stat();
        const head = Buffer.alloc(5);
        await file.read(head, 0, head.length, 0);
        const tail = Buffer.alloc(Math.min(size, TAIL_BYTES));
        await file.read(tail, 0, tail.length, size - tail.length);
        const mime = matchFileType(ext, head, tail);
        return mime ? { ext, mime } : null;
    } finally {
        await file.close();
    }
}
