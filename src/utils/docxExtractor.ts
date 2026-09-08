import * as RNFS from '@dr.pogodin/react-native-fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

/**
 * Extract plain text content from a Word (.docx) document.
 * .docx files are ZIP archives where the body content resides in word/document.xml.
 * We parse the XML tree in ordered mode without DOMParser to maintain Hermes compatibility.
 *
 * @param fileUri Local file URI (or path) to the .docx document.
 * @returns Extracted plain text string with paragraph breaks.
 */
export async function extractDocxText(fileUri: string): Promise<string> {
  let path = fileUri;
  if (path.startsWith('file://')) {
    path = path.slice(7);
  }

  // 1. Verify file exists
  const exists = await RNFS.exists(path);
  if (!exists) {
    throw new Error(`DOCX file not found at path: ${path}`);
  }

  // 2. Read file as base64
  const base64Data = await RNFS.readFile(path, 'base64');
  if (!base64Data) {
    throw new Error('DOCX file is empty or could not be read.');
  }

  // 3. Load ZIP archive in memory
  const zip = await JSZip.loadAsync(base64Data, { base64: true });
  const documentXmlEntry = zip.file('word/document.xml');
  if (!documentXmlEntry) {
    throw new Error('Invalid .docx file: "word/document.xml" entry not found in archive.');
  }

  // 4. Extract XML string
  const xmlContent = await documentXmlEntry.async('string');
  if (!xmlContent || !xmlContent.trim()) {
    return '';
  }

  // 5. Parse XML with preserveOrder: true to maintain sequence
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    trimValues: false,
  });

  const parsedNodes = parser.parse(xmlContent);
  if (!Array.isArray(parsedNodes)) {
    return '';
  }

  // 6. Walk tree collecting paragraphs and text nodes
  const paragraphs: string[] = [];
  let currentParagraphWords: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphWords.length > 0) {
      const paragraphText = currentParagraphWords.join('').trim();
      if (paragraphText.length > 0) {
        paragraphs.push(paragraphText);
      }
      currentParagraphWords = [];
    }
  };

  const walkNodes = (nodes: any[]) => {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;

      for (const key of Object.keys(node)) {
        if (key === ':@') {
          // Attribute object, skip
          continue;
        }

        if (key === '#text') {
          const val = node[key];
          if (val !== undefined && val !== null) {
            currentParagraphWords.push(String(val));
          }
        } else if (key === 'w:t') {
          const tChildren = node[key];
          if (Array.isArray(tChildren)) {
            for (const child of tChildren) {
              if (child && child['#text'] !== undefined) {
                currentParagraphWords.push(String(child['#text']));
              }
            }
          } else if (typeof tChildren === 'string' || typeof tChildren === 'number') {
            currentParagraphWords.push(String(tChildren));
          }
        } else if (key === 'w:tab') {
          currentParagraphWords.push('\t');
        } else if (key === 'w:br' || key === 'w:cr') {
          currentParagraphWords.push('\n');
        } else if (key === 'w:p') {
          // New paragraph boundary
          const pChildren = node[key];
          if (Array.isArray(pChildren)) {
            walkNodes(pChildren);
          }
          flushParagraph();
        } else {
          // Traverse into child nodes (w:r, w:body, etc.)
          const children = node[key];
          if (Array.isArray(children)) {
            walkNodes(children);
          }
        }
      }
    }
  };

  walkNodes(parsedNodes);
  flushParagraph();

  return paragraphs.join('\n\n').trim();
}
