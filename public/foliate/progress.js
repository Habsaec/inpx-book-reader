// assign a unique ID for each TOC item
const assignIDs = toc => {
    let id = 0
    const assignID = item => {
        item.id = id++
        if (item.subitems) for (const subitem of item.subitems) assignID(subitem)
    }
    for (const item of toc) assignID(item)
    return toc
}

const flatten = items => items
    .map(item => item.subitems?.length
        ? [item, flatten(item.subitems)].flat()
        : item)
    .flat()

export const flattenToc = (toc, out = []) => {
    for (const item of toc ?? []) {
        if (item?.href != null && item.href !== '') out.push(item)
        if (item?.subitems?.length) flattenToc(item.subitems, out)
    }
    return out
}

/** FB2: равный вес каждой линейной секции (не байты и не «пустые» заголовки). */
export class EqualSectionProgress {
    constructor(sections, sizePerLoc, sizePerTimeUnit) {
        this.linearIndices = sections
            .map((s, i) => (s.linear !== 'no' ? i : -1))
            .filter(i => i >= 0)
        const pseudo = this.linearIndices.map(() => ({ size: 1, linear: 'yes' }))
        this.inner = new SectionProgress(pseudo, sizePerLoc, sizePerTimeUnit)
        this.sections = sections
    }
    get sectionFractions() { return this.inner.sectionFractions }
    getSection(fraction) {
        const [local, anchor] = this.inner.getSection(fraction)
        return [this.linearIndices[local] ?? this.linearIndices[0] ?? 0, anchor]
    }
    getProgress(index, fractionInSection, pageFraction = 0) {
        const local = this.linearIndices.indexOf(index)
        if (local < 0) {
            const nearest = this.linearIndices.find(i => i >= index)
                ?? this.linearIndices[this.linearIndices.length - 1]
            return this.getProgress(nearest ?? 0, 0, 0)
        }
        return this.inner.getProgress(local, fractionInSection, pageFraction)
    }
}

/** FB2: ползунок по пунктам оглавления (главы), а не по «весу» HTML. */
export class TocFlatProgress {
    constructor(flatToc, sections, splitHref, sizePerLoc, sizePerTimeUnit, getTOCFragment) {
        this.items = flatToc
        this.sections = sections
        this.splitHref = splitHref
        this.getTOCFragment = getTOCFragment
        this.n = flatToc.length
        this.fallback = new EqualSectionProgress(sections, sizePerLoc, sizePerTimeUnit)
    }
    get sectionFractions() {
        if (this.n < 2) return this.fallback.sectionFractions
        return Array.from({ length: this.n + 1 }, (_, i) => i / this.n)
    }
    #flatIndex(href) {
        if (href == null || href === '') return -1
        return this.items.findIndex(t => t.href === href)
    }
    #intraChapterFraction(range, tocItem) {
        if (!range || !tocItem?.href || !this.getTOCFragment) return 0
        const doc = range.startContainer?.getRootNode?.()
        if (!doc?.createRange) return 0
        const parts = this.splitHref(tocItem.href) ?? []
        const frag = parts[1]
        const startEl = frag != null && frag !== ''
            ? this.getTOCFragment(doc, frag)
            : (doc.body?.firstElementChild ?? doc.body)
        if (!startEl) return 0
        const flatIdx = this.#flatIndex(tocItem.href)
        let endEl = null
        if (flatIdx >= 0 && flatIdx + 1 < this.n) {
            const next = this.items[flatIdx + 1]
            const [curSec] = parts
            const [nextSec, nextFrag] = this.splitHref(next.href) ?? []
            if (nextSec === curSec && nextFrag != null && nextFrag !== '') {
                endEl = this.getTOCFragment(doc, nextFrag)
            }
        }
        try {
            const total = doc.createRange()
            total.setStartBefore(startEl)
            if (endEl) total.setEndBefore(endEl)
            else if (doc.body) total.selectNodeContents(doc.body)
            const totalLen = total.toString().length
            if (!totalLen) return 0
            const done = doc.createRange()
            done.setStartBefore(startEl)
            done.setEnd(range.startContainer, range.startOffset)
            return Math.max(0, Math.min(1, done.toString().length / totalLen))
        } catch {
            return 0
        }
    }
    getProgressFromTocItem(tocItem, index, range, fractionInSection = 0, pageFraction = 0) {
        if (this.n < 2) return this.fallback.getProgress(index, fractionInSection, pageFraction)
        const flatIdx = this.#flatIndex(tocItem?.href)
        if (flatIdx < 0) return this.fallback.getProgress(index, fractionInSection, pageFraction)
        const intra = range
            ? this.#intraChapterFraction(range, tocItem)
            : Math.max(0, Math.min(1, fractionInSection + pageFraction * (1 - fractionInSection)))
        const fraction = Math.min(1, (flatIdx + intra) / this.n)
        const { sizePerLoc } = this.fallback.inner
        return {
            fraction,
            section: { current: index, total: this.sections.length },
            location: {
                current: Math.floor(flatIdx / sizePerLoc),
                next: Math.floor((flatIdx + 1) / sizePerLoc),
                total: Math.ceil(this.n / sizePerLoc),
            },
            time: { section: 0, total: 0 },
        }
    }
    getSection(fraction) {
        if (this.n < 2) return this.fallback.getSection(fraction)
        if (fraction <= 0) return this.fallback.getSection(0)
        if (fraction >= 1) return this.fallback.getSection(1)
        const slot = fraction * this.n
        const idx = Math.min(this.n - 1, Math.floor(slot))
        const within = slot - idx
        const [secIdx] = this.splitHref(this.items[idx].href) ?? [0]
        return [secIdx, within]
    }
    getProgress(index, fractionInSection, pageFraction = 0, tocItem = null, range = null) {
        if (tocItem?.href) {
            return this.getProgressFromTocItem(tocItem, index, range, fractionInSection, pageFraction)
        }
        if (this.n < 2) return this.fallback.getProgress(index, fractionInSection, pageFraction)
        return this.fallback.getProgress(index, fractionInSection, pageFraction)
    }
}

export class TOCProgress {
    async init({ toc, ids, splitHref, getFragment }) {
        assignIDs(toc)
        const items = flatten(toc)
        const grouped = new Map()
        for (const [i, item] of items.entries()) {
            const [id, fragment] = await splitHref(item?.href) ?? []
            const value = { fragment, item }
            if (grouped.has(id)) grouped.get(id).items.push(value)
            else grouped.set(id, { prev: items[i - 1], items: [value] })
        }
        const map = new Map()
        for (const [i, id] of ids.entries()) {
            if (grouped.has(id)) map.set(id, grouped.get(id))
            else map.set(id, map.get(ids[i - 1]))
        }
        this.ids = ids
        this.map = map
        this.getFragment = getFragment
    }
    getProgress(index, range) {
        if (!this.ids) return
        const id = this.ids[index]
        const obj = this.map.get(id)
        if (!obj) return null
        const { prev, items } = obj
        if (!items) return prev
        if (!range || items.length === 1 && !items[0].fragment) return items[0].item

        const doc = range.startContainer.getRootNode()
        for (const [i, { fragment }] of items.entries()) {
            const el = this.getFragment(doc, fragment)
            if (!el) continue
            if (range.comparePoint(el, 0) > 0)
                return (items[i - 1]?.item ?? prev)
        }
        return items[items.length - 1].item
    }
}

export class SectionProgress {
    constructor(sections, sizePerLoc, sizePerTimeUnit) {
        this.sizes = sections.map(s => s.linear != 'no' && s.size > 0 ? s.size : 0)
        this.sizePerLoc = sizePerLoc
        this.sizePerTimeUnit = sizePerTimeUnit
        this.sizeTotal = this.sizes.reduce((a, b) => a + b, 0)
        this.sectionFractions = this.#getSectionFractions()
    }
    #getSectionFractions() {
        const { sizeTotal } = this
        const results = [0]
        let sum = 0
        for (const size of this.sizes) results.push((sum += size) / sizeTotal)
        return results
    }
    // get progress given index of and fractions within a section
    getProgress(index, fractionInSection, pageFraction = 0) {
        const { sizes, sizePerLoc, sizePerTimeUnit, sizeTotal } = this
        const sizeInSection = sizes[index] ?? 0
        const sizeBefore = sizes.slice(0, index).reduce((a, b) => a + b, 0)
        const size = sizeBefore + fractionInSection * sizeInSection
        const nextSize = size + pageFraction * sizeInSection
        const remainingTotal = sizeTotal - size
        const remainingSection = (1 - fractionInSection) * sizeInSection
        return {
            // Resume anchor is the start of the currently visible page/viewport.
            // `nextSize` is only for location.next; persisting it as `fraction`
            // restores one page ahead and may cross a chapter boundary.
            fraction: size / sizeTotal,
            section: {
                current: index,
                total: sizes.length,
            },
            location: {
                current: Math.floor(size / sizePerLoc),
                next: Math.floor(nextSize / sizePerLoc),
                total: Math.ceil(sizeTotal / sizePerLoc),
            },
            time: {
                section: remainingSection / sizePerTimeUnit,
                total: remainingTotal / sizePerTimeUnit,
            },
        }
    }
    // get index of and fraction in section based on total fraction
    getSection(fraction) {
        const { sizes, sectionFractions, sizeTotal } = this
        const last = sizes.length - 1
        const firstSized = sizes.findIndex(s => s > 0)
        if (firstSized < 0) return [0, 0]
        if (fraction <= 0) return [firstSized, 0]
        if (fraction >= 1) {
            const lastSized = sizes.findLastIndex(s => s > 0)
            return [lastSized >= 0 ? lastSized : last, 1]
        }
        fraction = fraction + Number.EPSILON
        const firstStart = sectionFractions[firstSized] ?? 0
        if (firstStart > 0 && fraction < firstStart) {
            const span = sizes[firstSized] / sizeTotal
            return [firstSized, span > 0 ? fraction / span : 0]
        }
        let end = sectionFractions.findIndex(x => x > fraction)
        if (end < 0) end = last + 1
        let index = Math.max(firstSized, end - 1)
        while (index < sizes.length && !sizes[index]) index++
        if (index >= sizes.length) {
            const lastSized = sizes.findLastIndex(s => s > 0)
            return [lastSized >= 0 ? lastSized : last, 1]
        }
        const secStart = sectionFractions[index] ?? 0
        const secEnd = sectionFractions[index + 1] ?? 1
        const span = secEnd - secStart
        const anchor = span > 0 ? (fraction - secStart) / span : 0
        return [index, Math.max(0, Math.min(1, anchor))]
    }
}
