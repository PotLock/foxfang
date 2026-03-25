import { Settings as SettingsIcon } from 'lucide-react'
import '../Boards/Boards.css'

export default function Settings() {
  return (
    <div className="page">
      <header className="page-header">
        <SettingsIcon className="page-icon" />
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your FoxFang instance</p>
        </div>
      </header>
      
      <div className="page-content">
        <div className="board-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="board-card">
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>General Settings</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Settings configuration coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
