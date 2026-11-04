import { eq } from 'drizzle-orm'
import type { GuardianWeekResponse, GuardianWeekView, Language, TeacherMessage, TeacherMessageWithTranslation } from '@guardian-book/shared'
import type { Actor } from '../auth/session.js'
import type { DbOrTx } from '../db/client.js'
import { interventions, notes, profiles, reviewFeedback } from '../db/schema.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { guardianNotes } from '../notes/service.js'
import { guardianWeek } from '../plans/service.js'
import { preferredLanguage, translationFor, type SourceKind, type TranslateDeps } from './service.js'

/**
 * This week in the parent's language (brief B12 §2, §4): the guardian view of the issued
 * plan (three texts), and every teacher message the parent may read: sent notes,
 * guardian-audience feedback and the intervention sentence. The English always travels
 * with the translation; the screen labels the translation as model text.
 */

const MESSAGE_KIND: Record<TeacherMessage['kind'], SourceKind> = { note: 'note', feedback: 'review_feedback', intervention: 'intervention' }

/** The teacher behind a message, for the `{{T}}` placeholder: never sent to the model. */
export async function teacherNameFor(db: DbOrTx, message: Pick<TeacherMessage, 'kind' | 'id'>): Promise<string | null> {
  let teacherId: string | undefined
  if (message.kind === 'note') {
    teacherId = (await db.select({ id: notes.teacherId }).from(notes).where(eq(notes.id, message.id)).limit(1))[0]?.id
  } else if (message.kind === 'feedback') {
    teacherId = (await db.select({ id: reviewFeedback.createdBy }).from(reviewFeedback).where(eq(reviewFeedback.id, message.id)).limit(1))[0]?.id
  } else {
    teacherId = (await db.select({ id: interventions.ownerId }).from(interventions).where(eq(interventions.id, message.id)).limit(1))[0]?.id
  }
  if (!teacherId) return null
  const [teacher] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.userId, teacherId)).limit(1)
  return teacher?.nickname ?? null
}

/** Attaches the guardian's language and a translation state to every parent-facing text of the week. */
export async function withWeekTranslations(deps: TranslateDeps, actor: Actor, week: GuardianWeekResponse, language?: Language): Promise<GuardianWeekView> {
  const lang = language ?? (await preferredLanguage(deps.db, actor.userId))
  const learner = week.learner.nickname
  const translate = (kind: SourceKind, id: string, text: string, teacher: string | null) =>
    translationFor(deps, { kind, id, text, names: { learner, teacher } }, lang, actor.userId)

  const plan: GuardianWeekView['plan'] = week.plan
    ? {
        ...week.plan,
        translations:
          lang === 'en'
            ? null
            : {
                gap: (await translate('plan_gap', week.plan.id, week.plan.gap, null)) ?? { language: lang, status: 'unavailable', text: null },
                action: (await translate('plan_action', week.plan.id, week.plan.action, null)) ?? { language: lang, status: 'unavailable', text: null },
                celebrate: (await translate('plan_celebrate', week.plan.id, week.plan.celebrate, null)) ?? { language: lang, status: 'unavailable', text: null },
              },
      }
    : null

  const teacherMessages: TeacherMessageWithTranslation[] = []
  for (const message of week.teacherMessages) {
    const teacher = lang === 'en' ? null : await teacherNameFor(deps.db, message)
    teacherMessages.push({ ...message, translation: await translate(MESSAGE_KIND[message.kind], message.id, message.text, teacher) })
  }

  return { ...week, language: lang, plan, teacherMessages }
}

/**
 * After the guardian picks a language: read everything they may see, so the background
 * jobs start now rather than on their next visit. The reads are cheap; the jobs are bounded
 * by the caps.
 */
export async function warmTranslations(deps: PracticeDeps, actor: Actor, learnerIds: string[], language: Language): Promise<void> {
  if (language === 'en') return
  for (const learnerId of learnerIds) {
    try {
      await withWeekTranslations(deps, actor, await guardianWeek(deps, actor, learnerId), language)
    } catch (err) {
      deps.logger.warn('translate: warm-up read failed', { learnerId, err: err instanceof Error ? err.message : String(err) })
    }
  }
  await guardianNotes(deps, actor, language)
}
