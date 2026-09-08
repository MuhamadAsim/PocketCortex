import JSZip from 'jszip';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { extractDocxText } from '../src/utils/docxExtractor';
import {
  extractTextFromFile,
  chunkText,
} from '../src/services/knowledgeService';
import { extractPdfText } from '../src/native/PdfTextExtractor';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
  copyFile: jest.fn(),
  unlink: jest.fn(),
  CachesDirectoryPath: '/mock/cache',
  DocumentDirectoryPath: '/mock/docs',
}));

jest.mock('react-native-document-picker', () => ({
  pickSingle: jest.fn(),
  isCancel: jest.fn(),
  types: {
    plainText: 'text/plain',
    pdf: 'application/pdf',
    allFiles: '*/*',
  },
}));

jest.mock('../src/storage/mmkv', () => ({
  storage: {
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  },
  STORAGE_KEYS: {
    THEME_MODE: 'settings.theme_mode',
    SELECTED_MODEL_ID: 'models.selected_model_id',
    MODEL_STATE_PREFIX: 'models.state.',
    CHAT_HISTORY_PREFIX: 'chat.history.',
  },
  getThemePreference: jest.fn(() => 'dark'),
  setThemePreference: jest.fn(),
  getSelectedModelId: jest.fn(() => null),
  setSelectedModelId: jest.fn(),
  getModelDownloadState: jest.fn(() => null),
  saveModelDownloadState: jest.fn(),
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rows: [] })),
    executeSync: jest.fn(() => ({ rows: [] })),
  })),
}));

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(),
}));

jest.mock('../src/native/PdfTextExtractor', () => ({
  extractPdfText: jest.fn(),
  NativePdfTextExtractor: {
    extractText: jest.fn(),
  },
}));

describe('Step 10: Word (.docx) & PDF Import for Knowledge RAG', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Part 1 — Word (.docx) Extraction', () => {
    it('extracts paragraphs and text from a valid .docx ZIP archive', async () => {
      // 1. Construct a synthetic .docx archive in memory
      const zip = new JSZip();
      const mockXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>PocketCortex is an offline neural engine.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>It runs completely on-device with zero cloud latency.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
      zip.file('word/document.xml', mockXml);
      const base64Data = await zip.generateAsync({ type: 'base64' });

      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(base64Data);

      const extractedText = await extractDocxText('/path/to/test.docx');

      expect(extractedText).toContain('PocketCortex is an offline neural engine.');
      expect(extractedText).toContain('It runs completely on-device with zero cloud latency.');
      expect(extractedText).toBe(
        'PocketCortex is an offline neural engine.\n\nIt runs completely on-device with zero cloud latency.'
      );
    });

    it('throws error when word/document.xml is missing from the archive', async () => {
      const zip = new JSZip();
      zip.file('some_other_file.txt', 'Hello');
      const base64Data = await zip.generateAsync({ type: 'base64' });

      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(base64Data);

      await expect(extractDocxText('/path/to/corrupt.docx')).rejects.toThrow(
        'Invalid .docx file: "word/document.xml" entry not found in archive.'
      );
    });
  });

  describe('Part 2 & 3 — PDF Extraction & Dispatch Pipeline', () => {
    it('successfully extracts text from a clean PDF and round-trips into chunks', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (extractPdfText as jest.Mock).mockResolvedValue({
        text: 'This is page 1 content of the AI handbook. PocketCortex provides private local inference.',
        pageCount: 1,
        isLikelyScanned: false,
      });

      const extracted = await extractTextFromFile('file:///docs/handbook.pdf', 'handbook.pdf');
      expect(extracted).toContain('PocketCortex provides private local inference.');

      const chunks = chunkText(extracted, 300, 50);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('PocketCortex provides private local inference.');
    });

    it('detects and rejects a scanned PDF with user-facing OCR error', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (extractPdfText as jest.Mock).mockResolvedValue({
        text: '   ', // minimal / no text extracted from scanned images
        pageCount: 5,
        isLikelyScanned: true,
      });

      await expect(
        extractTextFromFile('file:///docs/scanned_book.pdf', 'scanned_book.pdf')
      ).rejects.toThrow(
        'Failed to import "scanned_book.pdf" (5 pages): Document appears to be a scanned image or empty. OCR import is not supported yet.'
      );
    });

    it('rejects unsupported file extensions', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await expect(
        extractTextFromFile('file:///docs/archive.zip', 'archive.zip')
      ).rejects.toThrow('Unsupported document format');
    });
  });
});
