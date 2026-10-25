import { useEffect, useState } from 'react'
import { AudioPlayer } from '../components/AudioPlayer'
import { Locked, QuestionText, RevealList, Sent, groupFreeAnswers, isValidated, ms, namesOf, parsePoints, podium } from './common'
import type { ModuleDef } from './types'

const author = (q: Record<string, unknown>) => q.answerHintAuthor ?? q.answerHint ?? ''
const title = (q: Record<string, unknown>) => q.answerHintTitle ?? q.answerHint ?? ''

export const blindtest: ModuleDef = {
  key: 'blindtest',
  name: 'Blind Test',
  icon: '🎵',
  tagline: 'Audio + réponse libre',
  rules: "Écoute l'extrait, trouve l'artiste et le titre. Chaque bonne réponse rapporte des points : 3, 2 et 1 pour les trois plus rapides, puis 1 pour les autres.",
  defaults: { timer: 30, podium: '3,2,1', others: 1, audioOnPhones: 0 },
  configFields: [
    { key: 'podium', label: 'Points des plus rapides (artiste et titre)', type: 'text', help: 'ex : 3,2,1' },
    { key: 'others', label: 'Points pour les autres bonnes réponses', type: 'number' },
    { key: 'audioOnPhones', label: 'Son aussi sur les téléphones (1 = oui)', type: 'number', help: 'utile sans écran commun' },
  ],
  questionFields: [
    { key: 'text', label: 'Consigne', type: 'text', placeholder: 'Quelle est cette chanson ? 🎵' },
    { key: 'audioUrl', label: 'Extrait audio', type: 'audio' },
    { key: 'answerHintAuthor', label: 'Artiste', type: 'text' },
    { key: 'answerHintTitle', label: 'Titre', type: 'text' },
  ],
  manual: true,
  isComplete: (d) => !!String(d.author ?? '').trim() && !!String(d.title ?? '').trim(),
  summary: (q) => `${author(q)} — ${title(q)}`,
  publicPayload: (q, { cfg }) => ({
    text: q.text || 'Quelle est cette chanson ? 🎵',
    audioUrl: q.audioUrl,
    audioOnPhones: Number(cfg.audioOnPhones) === 1,
  }),
  solution: (q) => ({ author: author(q), title: title(q), label: `${author(q)} — ${title(q)}` }),
  validationItems: ({ q, answers }) => [
    ...groupFreeAnswers(answers, (a) => a.data.author, author(q), 'a:', 'Artiste'),
    ...groupFreeAnswers(answers, (a) => a.data.title, title(q), 't:', 'Titre'),
  ],
  score: ({ answers, cfg, verdicts }) => {
    const pts = parsePoints(cfg.podium)
    const results: Record<string, { pts: number; detail?: string }> = {}
    const detail: Record<string, string[]> = {}
    for (const [field, prefix, label] of [
      ['author', 'a:', 'artiste'],
      ['title', 't:', 'titre'],
    ] as const) {
      const good = answers
        .filter((a) => isValidated({ verdicts }, a.data[field], prefix))
        .map((a) => ({ pid: a.pid, at: ms(a) }))
        .sort((a, b) => a.at - b.at)
      for (const r of podium(good, pts, () => false)) {
        // Hors podium, une bonne réponse rapporte quand même quelque chose
        const won = r.pts || Number(cfg.others ?? 0)
        results[r.pid] = { pts: (results[r.pid]?.pts ?? 0) + won }
        ;(detail[r.pid] ??= []).push(`${label} ✅`)
      }
    }
    for (const a of answers) {
      results[a.pid] = { pts: results[a.pid]?.pts ?? 0, detail: detail[a.pid]?.join(' · ') ?? '❌' }
    }
    return { results }
  },
  Player: ({ round, answer, submit, locked, me }) => {
    const [a, setA] = useState(answer?.data.author ?? '')
    const [t, setT] = useState(answer?.data.title ?? '')
    useEffect(() => {
      setA(answer?.data.author ?? '')
      setT(answer?.data.title ?? '')
    }, [answer?.data.author, answer?.data.title])
    const revealed = round.status === 'revealed'
    return (
      <>
        <QuestionText>{round.public.text}</QuestionText>
        {round.public.audioOnPhones && round.status === 'answering' && <AudioPlayer src={round.public.audioUrl} />}
        {revealed ? (
          <div className="big-answer">
            {round.solution?.label}
            <div className="muted small">{round.results?.[me.id]?.detail}</div>
          </div>
        ) : round.status === 'validating' ? (
          <p className="center muted">L'animateur valide les réponses…</p>
        ) : (
          <form
            className="free-answer"
            onSubmit={(e) => {
              e.preventDefault()
              void submit({ author: a.trim(), title: t.trim() })
            }}
          >
            <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Artiste" disabled={locked} autoComplete="off" />
            <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Titre" disabled={locked} autoComplete="off" />
            <button className="btn btn-primary" disabled={locked || (!a.trim() && !t.trim())}>
              Envoyer
            </button>
          </form>
        )}
        {answer && !locked && !revealed && <Sent />}
        {locked && round.status === 'answering' && <Locked />}
      </>
    )
  },
  Screen: ({ round, participants }) => (
    <>
      <QuestionText big>{round.public.text}</QuestionText>
      <AudioPlayer src={round.public.audioUrl} />
      {round.status === 'validating' && <p className="muted center">Validation en cours…</p>}
      {round.status === 'revealed' && (
        <>
          <div className="big-answer">{round.solution?.label}</div>
          <RevealList round={round} names={namesOf(participants)} />
        </>
      )}
    </>
  ),
}
