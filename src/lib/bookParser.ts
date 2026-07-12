import JSZip from 'jszip';

export interface Chapter {
  title: string;
  content: string[];
}

/**
 * Detects if a buffer starts with ZIP magic signature (PK\x03\x04)
 */
export function isZipBuffer(buffer: ArrayBuffer): boolean {
  const arr = new Uint8Array(buffer.slice(0, 4));
  return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04;
}

/**
 * Parses plain text (TXT) into structured chapters
 */
export function parseTxt(text: string): Chapter[] {
  const paragraphs = text
    .split(/\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    return [{ title: 'Книга', content: ['Содержимое книги пустое.'] }];
  }

  // Group into chapters if there are clear chapter marks, or simple chunks of 40 paragraphs
  const chapters: Chapter[] = [];
  let currentChapter: Chapter = { title: 'Глава 1', content: [] };
  let chapterParagraphCount = 0;

  paragraphs.forEach((p, idx) => {
    // Detect typical Russian chapter titles
    const isChapterHeader = /^(глава|часть|пролог|эпилог|введение|сноска|chapter|part|prologue|epilogue)\s+\d+|^(глава|часть|пролог|эпилог|введение|сноска|chapter|part|prologue|epilogue)\s+[ivxldcm]+|^[i|v|x|l|c|d|m]+\.\s+/i.test(p);
    
    if (isChapterHeader && idx > 0 && currentChapter.content.length > 0) {
      chapters.push(currentChapter);
      currentChapter = { title: p, content: [] };
      chapterParagraphCount = 0;
    } else if (idx === 0 && isChapterHeader) {
      currentChapter.title = p;
    } else {
      chapterParagraphCount++;
      // Split chapter when it reaches 50 paragraphs (using chapter-local count, not global index)
      if (chapterParagraphCount >= 50 && !isChapterHeader) {
        chapters.push(currentChapter);
        currentChapter = { title: `Часть ${chapters.length + 1}`, content: [] };
        chapterParagraphCount = 0;
      }
      currentChapter.content.push(p);
    }
  });

  if (currentChapter.content.length > 0) {
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * Parses FictionBook 2 (FB2) XML text into structured chapters
 */
export function parseFb2(xmlText: string): Chapter[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  
  // Find FB2 parser error or check namespace
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    console.warn('DOMParser warning while reading FB2, attempting fuzzy regex extraction...');
    return parseFuzzyFb2(xmlText);
  }

  const sections = xmlDoc.getElementsByTagName('section');
  if (sections.length === 0) {
    // fallback to p tags
    const paragraphs = Array.from(xmlDoc.getElementsByTagName('p'))
      .map(p => p.textContent?.trim() || '')
      .filter(p => p.length > 0);

    if (paragraphs.length > 0) {
      return [{ title: 'Книга', content: paragraphs }];
    }
    return [{ title: 'Книга', content: [xmlText.slice(0, 15000)] }];
  }

  // Filter: only top-level sections (direct children of body)
  const topLevelSections: Element[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    let parent = section.parentNode;
    let isNested = false;
    while (parent) {
      if (parent.nodeName.toLowerCase() === 'section') {
        isNested = true;
        break;
      }
      parent = parent.parentNode;
    }
    if (!isNested) {
      topLevelSections.push(section);
    }
  }

  // If no top-level sections found, use all sections
  const sectionsToProcess = topLevelSections.length > 0 ? topLevelSections : Array.from(sections);

  const chapters: Chapter[] = [];
  for (let i = 0; i < sectionsToProcess.length; i++) {
    const section = sectionsToProcess[i];
    
    // Find title of section
    const titleNode = section.getElementsByTagName('title')[0];
    let title = `Глава ${i + 1}`;
    if (titleNode) {
      const pNodes = titleNode.getElementsByTagName('p');
      if (pNodes.length > 0) {
        title = Array.from(pNodes).map(p => p.textContent || '').join(' ').trim();
      } else {
        title = titleNode.textContent?.trim() || title;
      }
    }

    // Extract paragraph tags inside this section (including nested subsections)
    const pElements = section.getElementsByTagName('p');
    const content: string[] = [];
    for (let j = 0; j < pElements.length; j++) {
      const p = pElements[j];
      const text = p.textContent?.trim() || '';
      if (text) {
        content.push(text);
      }
    }

    if (content.length > 0) {
      chapters.push({ title, content });
    }
  }

  if (chapters.length === 0) {
    const pElements = xmlDoc.getElementsByTagName('p');
    const content = Array.from(pElements)
      .map(p => p.textContent?.trim() || '')
      .filter(t => t);
    return [{ title: 'Начало', content }];
  }

  return chapters;
}

/**
 * Regex fallback in case DOMParser fails due to XML nesting errors in FB2
 */
function parseFuzzyFb2(xmlText: string): Chapter[] {
  const chapters: Chapter[] = [];
  // Use regex to locate <section> blocks
  const sectionRegex = /<section>([\s\S]*?)<\/section>/gi;
  let match;
  let index = 1;

  while ((match = sectionRegex.exec(xmlText)) !== null) {
    const sectionBody = match[1];
    
    // Extract title
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(sectionBody);
    let title = `Глава ${index}`;
    if (titleMatch) {
      // Extract p nodes inside title
      const pInTitleRegex = /<p>([\s\S]*?)<\/p>/gi;
      let pMatch;
      const titleParts: string[] = [];
      while ((pMatch = pInTitleRegex.exec(titleMatch[1])) !== null) {
        titleParts.push(pMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (titleParts.length > 0) {
        title = titleParts.join(' ');
      } else {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim() || title;
      }
    }

    // Extract p tags
    const pRegex = /<p>([\s\S]*?)<\/p>/gi;
    let pMatch;
    const content: string[] = [];
    while ((pMatch = pRegex.exec(sectionBody)) !== null) {
      const cleanP = pMatch[1].replace(/<[^>]+>/g, '').trim();
      if (cleanP) {
        content.push(cleanP);
      }
    }

    if (content.length > 0) {
      chapters.push({ title, content });
      index++;
    }
  }

  if (chapters.length === 0) {
    // Just find all p tags in the entire file
    const pRegex = /<p>([\s\S]*?)<\/p>/gi;
    let pMatch;
    const content: string[] = [];
    while ((pMatch = pRegex.exec(xmlText)) !== null) {
      const cleanP = pMatch[1].replace(/<[^>]+>/g, '').trim();
      if (cleanP) {
        content.push(cleanP);
      }
    }
    return [{ title: 'Книга', content }];
  }

  return chapters;
}

/**
 * Parses EPUB files from raw ArrayBuffer
 */
export async function parseEpub(arrayBuffer: ArrayBuffer): Promise<Chapter[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find container.xml
  const containerXmlFile = zip.file('META-INF/container.xml');
  if (!containerXmlFile) throw new Error('Некорректный EPUB: отсутствует META-INF/container.xml');
  
  const containerXmlText = await containerXmlFile.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXmlText, 'text/xml');
  const opfPath = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('Некорректный EPUB: отсутствует корневой файл OPF');

  // Read OPF manifest
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Некорректный EPUB: не найден OPF-файл по пути: ${opfPath}`);
  
  const opfText = await opfFile.async('text');
  const opfDoc = parser.parseFromString(opfText, 'text/xml');
  
  // Build manifest mapping ID -> href
  const manifestItems = opfDoc.getElementsByTagName('item');
  const itemsMap: Record<string, string> = {};
  for (let i = 0; i < manifestItems.length; i++) {
    const id = manifestItems[i].getAttribute('id');
    const href = manifestItems[i].getAttribute('href');
    if (id && href) {
      itemsMap[id] = href;
    }
  }

  // Get spine sequence
  const spineItems = opfDoc.getElementsByTagName('itemref');
  const readingOrder: string[] = [];
  for (let i = 0; i < spineItems.length; i++) {
    const idref = spineItems[i].getAttribute('idref');
    if (idref && itemsMap[idref]) {
      readingOrder.push(itemsMap[idref]);
    }
  }

  // Get base path of OPF
  const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const chapters: Chapter[] = [];

  for (let i = 0; i < readingOrder.length; i++) {
    const href = readingOrder[i];
    // Resolve relative href
    const fullHref = decodeURIComponent(baseDir + href);
    const htmlFile = zip.file(fullHref) || zip.file(href);
    if (!htmlFile) continue;

    const htmlText = await htmlFile.async('text');
    const htmlDoc = parser.parseFromString(htmlText, 'text/html');

    // Chapter Title detection
    let title = htmlDoc.getElementsByTagName('title')[0]?.textContent?.trim() || '';
    if (!title || title.toLowerCase() === 'untitled') {
      title = htmlDoc.querySelector('h1, h2, h3, h4')?.textContent?.trim() || `Глава ${chapters.length + 1}`;
    }

    // Extract text paragraphs
    const pElements = htmlDoc.querySelectorAll('p, li, blockquote, div.paragraph');
    const content: string[] = [];
    pElements.forEach(p => {
      // Avoid duplicate text from outer tags
      if (p.tagName === 'DIV' && p.querySelector('p')) return;
      const t = p.textContent?.trim();
      if (t && t.length > 1) {
        content.push(t);
      }
    });

    if (content.length > 0) {
      chapters.push({ title, content });
    }
  }

  if (chapters.length === 0) {
    // Try fuzzy extraction of any html files
    const htmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.html') || name.endsWith('.xhtml'));
    for (const name of htmlFiles) {
      const htmlText = await zip.files[name].async('text');
      const htmlDoc = parser.parseFromString(htmlText, 'text/html');
      const content: string[] = [];
      htmlDoc.querySelectorAll('p').forEach(p => {
        const text = p.textContent?.trim();
        if (text) content.push(text);
      });
      if (content.length > 0) {
        chapters.push({ title: name.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, ""), content });
      }
    }
  }

  if (chapters.length === 0) {
    throw new Error('EPUB файл пуст или не содержит распознаваемого текста.');
  }

  return chapters;
}

/**
 * Handles ZIP and FB2.ZIP unzipping and delegates to specific parsers
 */
export async function parseBookFile(
  fileName: string,
  buffer: ArrayBuffer
): Promise<{ title: string; chapters: Chapter[] }> {
  const isZip = isZipBuffer(buffer) || fileName.toLowerCase().endsWith('.zip');
  
  if (isZip) {
    const zip = await JSZip.loadAsync(buffer);
    // Search for fb2, epub, or txt files inside zip
    const files = Object.keys(zip.files);
    
    // Check if it is an epub format (mimetype file contains 'epub')
    const mimeFile = zip.file('mimetype');
    const mimeText = mimeFile ? (await mimeFile.async('text')).trim() : '';
    const isEpub = isEpubFile(files) || mimeText.includes('epub');

    if (isEpub) {
      const chapters = await parseEpub(buffer);
      return { title: fileName, chapters };
    }

    // Look for .fb2 files
    const fb2FileName = files.find(f => f.toLowerCase().endsWith('.fb2'));
    if (fb2FileName) {
      const fb2Text = await zip.file(fb2FileName)!.async('text');
      const chapters = parseFb2(fb2Text);
      return { title: fb2FileName.replace(/\.[^/.]+$/, ""), chapters };
    }

    // Look for .txt files
    const txtFileName = files.find(f => f.toLowerCase().endsWith('.txt'));
    if (txtFileName) {
      const txtText = await zip.file(txtFileName)!.async('text');
      const chapters = parseTxt(txtText);
      return { title: txtFileName.replace(/\.[^/.]+$/, ""), chapters };
    }

    throw new Error('В ZIP-архиве не найдены поддерживаемые форматы (.fb2, .epub, .txt)');
  } else {
    // Normal single files
    const decoder = new TextDecoder('utf-8');
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.endsWith('.fb2')) {
      const text = decoder.decode(buffer);
      const chapters = parseFb2(text);
      return { title: fileName.replace(/\.[^/.]+$/, ""), chapters };
    } else if (lowerName.endsWith('.epub')) {
      const chapters = await parseEpub(buffer);
      return { title: fileName.replace(/\.[^/.]+$/, ""), chapters };
    } else {
      // Default to TXT parsing
      let text = '';
      try {
        // Try UTF-8
        text = decoder.decode(buffer);
      } catch (e) {
        // Fallback to Win-1251 if cyrillic characters fail
        const winDecoder = new TextDecoder('windows-1251');
        text = winDecoder.decode(buffer);
      }
      const chapters = parseTxt(text);
      return { title: fileName.replace(/\.[^/.]+$/, ""), chapters };
    }
  }
}

function isEpubFile(files: string[]): boolean {
  return files.some(f => f.includes('META-INF/container.xml'));
}
