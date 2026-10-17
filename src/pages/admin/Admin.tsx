import { useSearchParams } from 'react-router'
import { Header } from '../../components/ui'
import { logout, useUser } from '../../lib/auth'
import { AdminGate } from './AdminGate'
import { ConfigTab } from './ConfigTab'
import { ContentTab } from './ContentTab'
import { GrandJeuTab } from './GrandJeuTab'
import { PacksTab } from './PacksTab'
import { SessionsTab } from './SessionsTab'
import { SettingsTab } from './SettingsTab'

const TABS = [
  { key: 'sessions', label: 'Sessions', C: SessionsTab },
  { key: 'content', label: 'Modules & Questions', C: ContentTab },
  { key: 'grandjeu', label: '🏁 Grand Jeu', C: GrandJeuTab },
  { key: 'packs', label: '📦 Packs', C: PacksTab },
  { key: 'config', label: 'Configuration', C: ConfigTab },
  { key: 'settings', label: 'Réglages', C: SettingsTab },
] as const

export default function AdminPage() {
  return (
    <AdminGate>
      <Admin />
    </AdminGate>
  )
}

function Admin() {
  const [params, setParams] = useSearchParams()
  const user = useUser()
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0]
  return (
    <div className="page admin">
      <Header
        title="🌱 Cultivage — Admin"
        right={
          <button className="btn btn-small" onClick={() => logout()} title={user?.email ?? ''}>
            Se déconnecter
          </button>
        }
      />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'tab' + (t.key === tab.key ? ' tab-on' : '')} onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </nav>
      <tab.C />
    </div>
  )
}
