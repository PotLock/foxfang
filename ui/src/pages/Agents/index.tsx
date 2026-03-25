import { Bot } from 'lucide-react'
import '../Boards/Boards.css'

export default function Agents() {
  const agents = [
    { id: 1, name: 'Content Specialist', role: 'content-specialist', status: 'online', tasks: 156 },
    { id: 2, name: 'Strategy Lead', role: 'strategy-lead', status: 'online', tasks: 89 },
    { id: 3, name: 'Growth Analyst', role: 'growth-analyst', status: 'offline', tasks: 234 },
  ]

  return (
    <div className="page">
      <header className="page-header">
        <Bot className="page-icon" />
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Manage your AI agents</p>
        </div>
      </header>
      
      <div className="page-content">
        <div className="board-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="board-card">
              <div className="board-header">
                <h3>{agent.name}</h3>
                <span className={`board-status board-status-${agent.status}`}>
                  {agent.status}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '12px' }}>
                Role: {agent.role}
              </p>
              <p className="board-tasks">{agent.tasks} tasks completed</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
