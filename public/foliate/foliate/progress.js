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
            fraction: nextSize / sizeTotal,
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
