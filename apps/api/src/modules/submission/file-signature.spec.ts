import { matchFileType } from './file-signature';

const PDF = Buffer.from('%PDF-1.7\n');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]);
const DOCX_TAIL = Buffer.from('PK\x01\x02....word/document.xml....');
const none = Buffer.alloc(0);

describe('matchFileType', () => {
    it('accepts content matching the extension', () => {
        expect(matchFileType('.pdf', PDF, none)).toBe('application/pdf');
        expect(matchFileType('.zip', ZIP, none)).toBe('application/zip');
        expect(matchFileType('.docx', ZIP, DOCX_TAIL)).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
    });

    it('rejects a renamed file', () => {
        expect(matchFileType('.pdf', ZIP, none)).toBeNull();
        expect(matchFileType('.zip', PDF, none)).toBeNull();
        expect(matchFileType('.docx', PDF, DOCX_TAIL)).toBeNull();
    });

    it('rejects a plain ZIP named .docx', () => {
        expect(
            matchFileType('.docx', ZIP, Buffer.from('PK\x01\x02a.txt')),
        ).toBeNull();
    });

    it('rejects other extensions and empty files', () => {
        expect(matchFileType('.exe', PDF, none)).toBeNull();
        expect(matchFileType('', PDF, none)).toBeNull();
        expect(matchFileType('.pdf', Buffer.alloc(5), none)).toBeNull();
    });
});
