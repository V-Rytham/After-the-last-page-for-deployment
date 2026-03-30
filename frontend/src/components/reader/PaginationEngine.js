const DEFAULT_EPSILON_PX = 0.5;

const isWhitespaceChar = (char) => /\s/.test(char);

const isHeadingElement = (node) => {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = node.tagName?.toLowerCase?.();
  return tag === 'h1'
    || tag === 'h2'
    || tag === 'h3'
    || tag === 'h4'
    || tag === 'h5'
    || tag === 'h6';
};

const isParagraphElement = (node) => (
  node
  && node.nodeType === Node.ELEMENT_NODE
  && node.tagName?.toLowerCase?.() === 'p'
);

const getEffectiveText = (node) => String(node?.textContent || '');

const snapOffsetBackwardToWordBoundary = (text, offset, minOffset) => {
  const length = text.length;
  const clampedMin = Math.max(0, Math.min(minOffset ?? 0, length));
  let i = Math.max(clampedMin, Math.min(offset ?? 0, length));

  if (i <= clampedMin) return clampedMin;
  if (i >= length) return length;

  // If we're in the middle of a word (…\S|\S…), move left until boundary.
  while (i > clampedMin && i < length && !isWhitespaceChar(text[i - 1]) && !isWhitespaceChar(text[i])) {
    i -= 1;
  }

  // If we land on whitespace, prefer trimming consecutive whitespace at end.
  while (i > clampedMin && isWhitespaceChar(text[i - 1])) {
    i -= 1;
  }

  return Math.max(clampedMin, i);
};

const getTextNodesInOrder = (root) => {
  const cached = getTextNodesInOrder._cache?.get(root);
  if (cached) return cached;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });

  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }

  if (!getTextNodesInOrder._cache) {
    getTextNodesInOrder._cache = new WeakMap();
  }
  getTextNodesInOrder._cache.set(root, nodes);

  return nodes;
};

const resolveDomPositionAtTextOffset = (root, offset) => {
  const nodes = getTextNodesInOrder(root);
  let remaining = Math.max(0, offset);

  if (nodes.length === 0) {
    return { node: root, offset: 0 };
  }

  for (const textNode of nodes) {
    const len = textNode.nodeValue.length;
    if (remaining <= len) {
      return { node: textNode, offset: remaining };
    }
    remaining -= len;
  }

  const last = nodes[nodes.length - 1];
  return { node: last, offset: last.nodeValue.length };
};

const cloneBlockSliceByTextOffsets = (blockEl, startOffset, endOffset) => {
  const text = getEffectiveText(blockEl);
  const textLength = text.length;
  const start = Math.max(0, Math.min(startOffset ?? 0, textLength));
  const end = Math.max(start, Math.min(endOffset ?? textLength, textLength));

  // If there's no text content, treat it as atomic.
  if (textLength === 0) {
    return { slice: blockEl.cloneNode(true), usedStartOffset: 0, usedEndOffset: 0, totalTextLength: 0 };
  }

  const range = document.createRange();
  const startPos = resolveDomPositionAtTextOffset(blockEl, start);
  const endPos = resolveDomPositionAtTextOffset(blockEl, end);

  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const fragment = range.cloneContents();
  const wrapper = blockEl.cloneNode(false);
  wrapper.append(fragment);

  return { slice: wrapper, usedStartOffset: start, usedEndOffset: end, totalTextLength: textLength };
};

const normalizeChapterBlocks = (html) => {
  const root = document.createElement('div');
  root.innerHTML = String(html || '');

  const blocks = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const cleaned = String(node.nodeValue || '').trim();
      if (!cleaned) continue;
      const p = document.createElement('p');
      p.textContent = cleaned;
      blocks.push(p);
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      blocks.push(node);
    }
  }

  return blocks;
};

const applyLayoutStyles = (el, layout) => {
  if (!el) return;
  const next = layout || {};

  if (typeof next.fontSizeRem === 'number') el.style.fontSize = `${next.fontSizeRem}rem`;
  if (typeof next.lineHeight === 'number') el.style.lineHeight = String(next.lineHeight);

  if (typeof next.fontFamily === 'string') {
    el.style.setProperty('--font-reading', next.fontFamily);
  }

  if (typeof next.marginScale === 'number') {
    el.style.setProperty('--reader-margin-scale', String(next.marginScale));
  }
};

const compareBoundary = (a, b) => {
  const aBlock = Number(a?.blockIndex || 0);
  const bBlock = Number(b?.blockIndex || 0);
  if (aBlock !== bBlock) return aBlock - bBlock;

  const aOffset = Number(a?.textOffset || 0);
  const bOffset = Number(b?.textOffset || 0);
  return aOffset - bOffset;
};

export class PaginationEngine {
  constructor({ viewportEl, layout, epsilonPx } = {}) {
    this.viewportEl = viewportEl ?? null;
    this.layout = layout ?? {};
    this.epsilonPx = typeof epsilonPx === 'number' ? epsilonPx : DEFAULT_EPSILON_PX;

    this.blocks = [];
    this.pageStarts = [{ blockIndex: 0, textOffset: 0 }];
    this.pageHtmlCache = new Map();
    this.isDone = false;
    this.totalPages = null;

    this.measureEl = null;
    this._ensureMeasureHost();
  }

  destroy() {
    if (this.measureEl?.parentNode) {
      this.measureEl.parentNode.removeChild(this.measureEl);
    }
    this.measureEl = null;
  }

  setViewportEl(viewportEl) {
    this.viewportEl = viewportEl;
    this._syncMeasureSize();
  }

  setLayout(layout) {
    this.layout = layout || {};
    applyLayoutStyles(this.measureEl, this.layout);
  }

  setChapterHtml(chapterHtml) {
    this.blocks = normalizeChapterBlocks(chapterHtml);
    this.resetPagination();
  }

  resetPagination() {
    this.pageStarts = [{ blockIndex: 0, textOffset: 0 }];
    this.pageHtmlCache.clear();
    this.isDone = false;
    this.totalPages = null;
    this._clearMeasure();
    this._syncMeasureSize();
  }

  getTotalPagesIfKnown() {
    return this.totalPages;
  }

  getComputedPageCount() {
    return this.pageHtmlCache.size;
  }

  getPageStartBoundary(pageIndex) {
    const index = Math.max(0, Number(pageIndex) || 0);
    const boundary = this.pageStarts[index];
    if (!boundary) return null;
    return { blockIndex: boundary.blockIndex, textOffset: boundary.textOffset || 0 };
  }

  getReadingAnchorForBoundary(boundary) {
    const resolved = boundary ? { blockIndex: Number(boundary.blockIndex || 0), textOffset: Number(boundary.textOffset || 0) } : { blockIndex: 0, textOffset: 0 };
    const block = this.blocks[resolved.blockIndex] ?? null;

    let paragraphIndex = 0;
    for (let i = 0; i < Math.min(resolved.blockIndex, this.blocks.length); i += 1) {
      if (isParagraphElement(this.blocks[i])) paragraphIndex += 1;
    }

    let characterOffset = 0;
    if (block && isParagraphElement(block)) {
      const text = getEffectiveText(block);
      characterOffset = Math.max(0, Math.min(text.length, resolved.textOffset));
    }

    return {
      blockIndex: resolved.blockIndex,
      textOffset: resolved.textOffset,
      paragraphIndex,
      characterOffset,
    };
  }

  getReadingAnchorForPageStart(pageIndex) {
    const boundary = this.getPageStartBoundary(pageIndex);
    if (!boundary) return null;
    return this.getReadingAnchorForBoundary(boundary);
  }

  boundaryFromReadingAnchor(anchor) {
    if (!anchor) return { blockIndex: 0, textOffset: 0 };

    if (Number.isFinite(anchor.blockIndex)) {
      return { blockIndex: Math.max(0, Number(anchor.blockIndex) || 0), textOffset: Math.max(0, Number(anchor.textOffset) || 0) };
    }

    const desiredParagraph = Math.max(0, Number(anchor.paragraphIndex) || 0);
    const desiredOffset = Math.max(0, Number(anchor.characterOffset) || 0);

    let paragraphIndex = 0;
    for (let i = 0; i < this.blocks.length; i += 1) {
      const block = this.blocks[i];
      if (!isParagraphElement(block)) continue;

      if (paragraphIndex === desiredParagraph) {
        const text = getEffectiveText(block);
        return { blockIndex: i, textOffset: Math.max(0, Math.min(text.length, desiredOffset)) };
      }

      paragraphIndex += 1;
    }

    return { blockIndex: 0, textOffset: 0 };
  }

  ensurePageIndexForBoundary(boundary) {
    const target = boundary ? { blockIndex: boundary.blockIndex, textOffset: boundary.textOffset || 0 } : { blockIndex: 0, textOffset: 0 };

    let pageIndex = 0;
    while (true) {
      if (!this.pageHtmlCache.has(pageIndex) && !this.isDone) {
        this._computeNextPage();
      }

      const nextStart = this.pageStarts[pageIndex + 1];
      if (nextStart && compareBoundary(target, nextStart) < 0) {
        return pageIndex;
      }

      if (this.isDone && this.totalPages != null) {
        return Math.max(0, Math.min(pageIndex, this.totalPages - 1));
      }

      pageIndex += 1;
    }
  }

  getPageHtmlIfCached(pageIndex) {
    return this.pageHtmlCache.get(pageIndex) ?? null;
  }

  ensurePage(pageIndex) {
    const targetIndex = Math.max(0, Number(pageIndex) || 0);
    if (this.pageHtmlCache.has(targetIndex)) {
      return {
        html: this.pageHtmlCache.get(targetIndex),
        totalPages: this.totalPages,
        isDone: this.isDone,
      };
    }

    while (!this.isDone && !this.pageHtmlCache.has(targetIndex)) {
      this._computeNextPage();
    }

    return {
      html: this.pageHtmlCache.get(targetIndex) ?? '',
      totalPages: this.totalPages,
      isDone: this.isDone,
    };
  }

  precomputeThrough(pageIndex) {
    const targetIndex = Math.max(0, Number(pageIndex) || 0);
    while (!this.isDone && this.pageHtmlCache.size <= targetIndex) {
      this._computeNextPage();
    }
  }

  precomputeNextPages(count = 1) {
    const steps = Math.max(0, Number(count) || 0);
    for (let i = 0; i < steps && !this.isDone; i += 1) {
      this._computeNextPage();
    }
  }

  _ensureMeasureHost() {
    if (this.measureEl) return;

    const el = document.createElement('main');
    el.className = 'reading-column reader-content-wrapper font-serif';
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'absolute';
    el.style.left = '-99999px';
    el.style.top = '0';
    el.style.visibility = 'hidden';
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';
    el.style.contain = 'layout style paint';

    document.body.appendChild(el);
    this.measureEl = el;
    applyLayoutStyles(this.measureEl, this.layout);
    this._syncMeasureSize();
  }

  _syncMeasureSize() {
    if (!this.measureEl || !this.viewportEl) return;
    const rect = this.viewportEl.getBoundingClientRect();

    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    this.measureEl.style.width = `${width}px`;
    this.measureEl.style.height = `${height}px`;
  }

  _clearMeasure() {
    if (!this.measureEl) return;
    this.measureEl.innerHTML = '';
  }

  _isOverflowing() {
    if (!this.measureEl) return false;
    return this.measureEl.scrollHeight > (this.measureEl.clientHeight + this.epsilonPx);
  }

  _appendAndCheck(node) {
    this.measureEl.appendChild(node);
    return this._isOverflowing();
  }

  _removeLastChild() {
    const last = this.measureEl.lastChild;
    if (last) this.measureEl.removeChild(last);
  }

  _computeNextPage() {
    const nextPageIndex = this.pageHtmlCache.size;
    const start = this.pageStarts[nextPageIndex] ?? { blockIndex: 0, textOffset: 0 };

    this._syncMeasureSize();
    this._clearMeasure();

    if (start.blockIndex >= this.blocks.length) {
      this.isDone = true;
      this.totalPages = nextPageIndex;
      return;
    }

    let blockIndex = start.blockIndex;
    let textOffset = start.textOffset || 0;

    const setAndFinish = (nextStartBoundary) => {
      this.pageHtmlCache.set(nextPageIndex, this.measureEl.innerHTML);
      this.pageStarts[nextPageIndex + 1] = nextStartBoundary;
      if (nextStartBoundary.blockIndex >= this.blocks.length) {
        this.isDone = true;
        this.totalPages = nextPageIndex + 1;
      }
    };

    while (blockIndex < this.blocks.length) {
      const block = this.blocks[blockIndex];

      if (textOffset > 0) {
        const text = getEffectiveText(block);
        const totalLen = text.length;
        const sliceFromOffset = cloneBlockSliceByTextOffsets(block, textOffset, totalLen).slice;

        this.measureEl.appendChild(sliceFromOffset);
        if (this._isOverflowing()) {
          // The remaining part still doesn't fit: split within this block from textOffset.
          this._removeLastChild();
          const boundary = this._splitSingleBlockIntoPage(block, blockIndex, textOffset);
          setAndFinish(boundary);
          return;
        }

        blockIndex += 1;
        textOffset = 0;
        continue;
      }

      if (isHeadingElement(block) && isParagraphElement(this.blocks[blockIndex + 1])) {
        const headingClone = block.cloneNode(true);
        const paraClone = this.blocks[blockIndex + 1].cloneNode(true);

        this.measureEl.appendChild(headingClone);
        this.measureEl.appendChild(paraClone);

        if (this._isOverflowing()) {
          // Keep heading with paragraph if possible; otherwise, start a fresh page at the heading.
          this.measureEl.removeChild(paraClone);
          this.measureEl.removeChild(headingClone);

          if (this.measureEl.childNodes.length > 0) {
            setAndFinish({ blockIndex, textOffset: 0 });
            return;
          }

          // If we're on an empty page, let the heading go first.
          this.measureEl.appendChild(block.cloneNode(true));
          if (this._isOverflowing()) {
            this._removeLastChild();
            const boundary = this._splitSingleBlockIntoPage(block, blockIndex, 0);
            setAndFinish(boundary);
            return;
          }

          setAndFinish({ blockIndex: blockIndex + 1, textOffset: 0 });
          return;
        }

        blockIndex += 2;
        continue;
      }

      const clone = block.cloneNode(true);
      const overflowed = this._appendAndCheck(clone);

      if (!overflowed) {
        blockIndex += 1;
        continue;
      }

      this._removeLastChild();

      if (this.measureEl.childNodes.length > 0) {
        if (isParagraphElement(block)) {
          const boundary = this._splitSingleBlockIntoPage(block, blockIndex, 0);
          if (boundary.blockIndex === blockIndex && (boundary.textOffset || 0) === 0) {
            setAndFinish({ blockIndex, textOffset: 0 });
            return;
          }

          setAndFinish(boundary);
          return;
        }

        setAndFinish({ blockIndex, textOffset: 0 });
        return;
      }

      // This single block doesn't fit on an empty page: split it.
      const boundary = this._splitSingleBlockIntoPage(block, blockIndex, 0);
      setAndFinish(boundary);
      return;
    }

    setAndFinish({ blockIndex: this.blocks.length, textOffset: 0 });
  }

  _splitSingleBlockIntoPage(block, blockIndex, startOffset) {
    const text = getEffectiveText(block);
    const totalLen = text.length;

    // Atomic blocks (no text) can't be split: place it and advance.
    if (totalLen === 0) {
      this.measureEl.appendChild(block.cloneNode(true));
      return { blockIndex: blockIndex + 1, textOffset: 0 };
    }

    const containerWasEmpty = this.measureEl.childNodes.length === 0;

    // If there's no vertical room left (due to padding), bail to next page.
    if (!containerWasEmpty && this._isOverflowing()) {
      return { blockIndex, textOffset: startOffset };
    }

    const placeholder = block.cloneNode(false);
    this.measureEl.appendChild(placeholder);

    const fitsAt = (candidateOffset) => {
      const snapped = snapOffsetBackwardToWordBoundary(text, candidateOffset, startOffset);
      placeholder.innerHTML = '';
      const { slice } = cloneBlockSliceByTextOffsets(block, startOffset, snapped);
      placeholder.append(...Array.from(slice.childNodes));
      return !this._isOverflowing();
    };

    let low = startOffset;
    let high = totalLen;
    let best = startOffset;

    // If even the startOffset produces overflow, remove placeholder and return no progress.
    if (!fitsAt(startOffset)) {
      this.measureEl.removeChild(placeholder);
      return { blockIndex, textOffset: startOffset };
    }

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (fitsAt(mid)) {
        best = snapOffsetBackwardToWordBoundary(text, mid, startOffset);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const finalEnd = Math.max(startOffset, Math.min(best, totalLen));
    if (finalEnd === startOffset && startOffset < totalLen) {
      // Avoid producing an empty, non-advancing page on extremely small viewports.
      placeholder.innerHTML = '';
      const { slice: remainder } = cloneBlockSliceByTextOffsets(block, startOffset, totalLen);
      placeholder.append(...Array.from(remainder.childNodes));
      return { blockIndex: blockIndex + 1, textOffset: 0 };
    }

    placeholder.innerHTML = '';
    const { slice: finalSlice } = cloneBlockSliceByTextOffsets(block, startOffset, finalEnd);
    placeholder.append(...Array.from(finalSlice.childNodes));

    if (finalEnd >= totalLen) {
      return { blockIndex: blockIndex + 1, textOffset: 0 };
    }

    return { blockIndex, textOffset: finalEnd };
  }
}
