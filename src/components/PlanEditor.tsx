'use client'

import { useT } from '@/i18n/client'
import type { MapIssue } from '@/lib/map/check'
import type { DiagramPlan, PlanSection } from '@/lib/map/plan'
import { Markdownish } from './Markdownish'

/**
 * Relire et modifier un plan : titre, racine, structure commune, et chaque section (texte, ce
 * qu'elle développe, taille, synthèse), dans l'ordre voulu. Partagé par la création en plusieurs
 * étapes et le plan d'un schéma existant.
 */
export function PlanEditor({
  plan,
  onChange,
  issues,
  existing,
}: {
  plan: DiagramPlan
  onChange(plan: DiagramPlan): void
  issues: MapIssue[]
  /** Plan d'un schéma existant : identifiants de ses éléments (sections reprises). */
  existing?: Set<string>
}) {
  const t = useT()
  const change = (patch: Partial<DiagramPlan>) => onChange({ ...plan, ...patch })
  const changeSection = (i: number, patch: Partial<PlanSection>) => change({ sections: plan.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const moveSection = (i: number, by: number) => {
    if (i + by < 0 || i + by >= plan.sections.length) return
    const sections = [...plan.sections]
    ;[sections[i], sections[i + by]] = [sections[i + by], sections[i]]
    change({ sections })
  }
  /** Une borne de la plage de paragraphes d'une section (plan d'un texte). */
  const rangeInput = (i: number, range: [number, number], k: 0 | 1, label: string) => (
    <input
      className="preset-input staged-size"
      type="number"
      min={1}
      value={range[k]}
      aria-label={label}
      onChange={(e) => {
        const next: [number, number] = [...range]
        next[k] = Math.max(1, Number(e.target.value) || 1)
        changeSection(i, { paragraphs: next })
      }}
    />
  )
  const addSection = () => {
    const ids = new Set([plan.root.id, ...plan.sections.map((s) => s.id)])
    let n = plan.sections.length + 1
    while (ids.has(`s${n}`)) n++
    const relation = plan.sections[0]?.relation
    change({ sections: [...plan.sections, { id: `s${n}`, text: t.staged.newSection, brief: '', ...(relation && { relation }) }] })
  }

  return (
    <>
      <h3 className="preset-group-title">{t.staged.planTitle}</h3>
      {plan.summary && (
        <div className="patch-summary-text text-xs">
          <Markdownish text={plan.summary} />
        </div>
      )}
      <label className="grid gap-1 text-xs">
        <span className="text-zinc-500">{t.staged.title}</span>
        <input className="preset-input" value={plan.title} onChange={(e) => change({ title: e.target.value })} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-zinc-500">{t.staged.root}</span>
        <input className="preset-input" value={plan.root.text} onChange={(e) => change({ root: { ...plan.root, text: e.target.value } })} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-zinc-500">{t.staged.pattern}</span>
        <textarea
          className="map-json-input assistant-instruction"
          rows={2}
          value={plan.pattern ?? ''}
          placeholder={t.staged.patternPlaceholder}
          onChange={(e) => change({ pattern: e.target.value || undefined })}
        />
      </label>
      <ol className="grid gap-2">
        {plan.sections.map((s, i) => (
          <li key={s.id} className="staged-section grid gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-zinc-500">{t.staged.section(i + 1)}</span>
              {existing?.has(s.id) && <span className="text-xs text-emerald-700">· {t.plan.inDiagram}</span>}
              <span className="flex-1" />
              <button className="preset-icon" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label={t.staged.moveUp} title={t.staged.moveUp}>
                ↑
              </button>
              <button
                className="preset-icon"
                disabled={i === plan.sections.length - 1}
                onClick={() => moveSection(i, 1)}
                aria-label={t.staged.moveDown}
                title={t.staged.moveDown}
              >
                ↓
              </button>
              <button
                className="preset-icon"
                disabled={plan.sections.length <= 1}
                onClick={() => change({ sections: plan.sections.filter((_, k) => k !== i) })}
                aria-label={t.staged.remove}
                title={t.staged.remove}
              >
                ✕
              </button>
            </div>
            <input className="preset-input text-sm" value={s.text} onChange={(e) => changeSection(i, { text: e.target.value })} aria-label={t.staged.section(i + 1)} />
            <textarea
              className="map-json-input assistant-instruction"
              rows={2}
              value={s.brief}
              placeholder={t.staged.brief}
              aria-label={t.staged.brief}
              onChange={(e) => changeSection(i, { brief: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                {t.staged.size}
                <input
                  className="preset-input staged-size"
                  type="number"
                  min={1}
                  max={40}
                  value={s.size ?? ''}
                  onChange={(e) => changeSection(i, { size: e.target.value ? Math.min(40, Math.max(1, Number(e.target.value))) : undefined })}
                />
              </label>
              {s.paragraphs && (
                <span className="flex items-center gap-1">
                  {t.staged.paragraphs} §{rangeInput(i, s.paragraphs, 0, t.staged.paragraphs)}
                  {t.staged.paragraphsTo} {rangeInput(i, s.paragraphs, 1, `${t.staged.paragraphs} (${t.staged.paragraphsTo})`)}
                </span>
              )}
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!s.synthesis} onChange={(e) => changeSection(i, { synthesis: e.target.checked || undefined })} />
                {t.staged.synthesis}
              </label>
            </div>
          </li>
        ))}
      </ol>
      <button className="btn-xs justify-self-start" onClick={addSection} disabled={plan.sections.length >= 12}>
        + {t.staged.addSection}
      </button>
      {issues.length > 0 && (
        <ul className="map-json-issues text-xs text-red-700">
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.path && <code className="text-zinc-500">{issue.path}</code>} {t.mapJson.issues[issue.code]}
              {issue.detail && <span className="text-zinc-500"> ({issue.detail})</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
