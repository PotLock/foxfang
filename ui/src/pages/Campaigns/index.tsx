import { Target } from 'lucide-react'
import '../Boards/Boards.css'

export default function Campaigns() {
  return (
    <div className="page">
      <header className="page-header">
        <Target className="page-icon" />
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Manage your marketing campaigns</p>
        </div>
      </header>
      
      <div className="page-content">
        <div className="board-grid">
          {[
            { name: 'Q1 Product Launch', status: 'active', progress: 65, budget: '$5,000' },
            { name: 'Social Media Blitz', status: 'active', progress: 42, budget: '$2,500' },
          ].map((campaign) => (
            <div key={campaign.name} className="board-card">
              <div className="board-header">
                <h3>{campaign.name}</h3>
                <span className={`board-status board-status-${campaign.status}`}>
                  {campaign.status}
                </span>
              </div>
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Progress</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{campaign.progress}%</span>
                </div>
                <div style={{ 
                  height: '8px', 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${campaign.progress}%`,
                    background: 'var(--fox-primary)',
                    borderRadius: '4px'
                  }} />
                </div>
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Budget: {campaign.budget}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
