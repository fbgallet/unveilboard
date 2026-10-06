'use client'

import { useState } from 'react'
import { useValue } from 'tldraw'
import { useT } from '@/i18n/client'
import {
  findPrompt,
  promptGroups,
  promptLibraryAtom,
  promptLibraryOpenAtom,
  readPromptChoice,
  writePromptChoice,
  type PromptGroup,
} from '@/lib/prompts/library'
import { PROMPT_TASKS, methodOf, type PromptContext, type PromptTask, type PromptTemplate } from '@/lib/prompts/template'
import type { PromptMethod, Task } from '@/lib/ai/prompts'

export interface PromptChoice {
  groups: PromptGroup[]
  /** Le prompt choisi, s'il est toujours proposé pour cette tâche. */
  template?: PromptTemplate
  /** Ce qui part avec la demande. */
  method?: PromptMethod
  choose(id: string): void
}

const isPromptTask = (task: Task): task is PromptTask => (PROMPT_TASKS as readonly Task[]).includes(task)

/**
 * Méthode choisie pour une tâche : la dernière choisie sur cet appareil, tant qu'elle est proposée.
 * Une tâche sans boîte de dialogue (étapes d'une création en plusieurs temps) n'en propose aucune.
 * `context.source` : la demande s'appuie sur un texte source (les prompts d'explication de texte).
 */
export function usePromptChoice(task: Task, context: PromptContext = {}): PromptChoice {
  const t = useT()
  const settings = useValue(promptLibraryAtom)
  // Le choix est relu à chaque rendu (la tâche peut changer) ; `bump` redessine après un choix.
  const [, bump] = useState(0)
  if (!isPromptTask(task)) return { groups: [], choose: () => {} }
  const groups = promptGroups(settings, task, t.prompts.defaultGroup, context)
  const id = readPromptChoice(task)
  const offered = !!id && groups.some((g) => g.prompts.some((p) => p.id === id))
  const template = offered ? findPrompt(settings, id, t.prompts.defaultGroup) : undefined
  return {
    groups,
    template,
    method: template && methodOf(template),
    choose(next) {
      writePromptChoice(task, next)
      bump((n) => n + 1)
    },
  }
}

/** Choix de la méthode (prompt de la bibliothèque) dans une boîte de l'IA. */
export function PromptPicker({ choice, disabled }: { choice: PromptChoice; disabled?: boolean }) {
  const t = useT()
  const manage = (
    <button className="btn-xs" onClick={() => promptLibraryOpenAtom.set(true)}>
      {t.prompts.manage}
    </button>
  )
  if (!choice.groups.length) return <div className="flex items-center gap-2 text-xs text-zinc-500">{manage}</div>
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-zinc-600">{t.prompts.method}</span>
          <select
            className="preset-input min-w-0 flex-1"
            value={choice.template?.id ?? ''}
            disabled={disabled}
            onChange={(e) => choice.choose(e.target.value)}
            aria-label={t.prompts.method}
          >
            <option value="">{t.prompts.none}</option>
            {choice.groups.map((g) => (
              <optgroup key={g.id} label={g.title}>
                {g.prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {manage}
      </div>
      {choice.template?.description && <p className="text-zinc-500">{choice.template.description}</p>}
    </div>
  )
}
