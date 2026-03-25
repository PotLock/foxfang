import { FolderKanban } from 'lucide-react'
import './Boards.css'

export default function Boards() {
  return (
    <div className="page">
      <header className="page-header">
        <FolderKanban className="page-icon" />
        <div>
          <h1 className="page-title">Boards</h1>
          <p className="page-subtitle">Manage your project boards</p>
        </div>
      </header>
      
      <div className="page-content">
        <div className="board-grid">
          {[
            { name: 'Content Calendar', tasks: 24, status: 'active' },
            { name: 'Q1 Marketing', tasks: 18, status: 'active' },
            { name: 'Social Media', tasks: 32, status: 'active' },
            { name: 'Product Launch', tasks: 45, status: 'paused' },
          ].map((board) => (
            <div key={board.name} className="board-card">
              <div className="board-header">
                <h3>{board.name}</h3>
                <span className={`board-status board-status-${board.status}`}>
                  {board.status}
                </span>
              </div>
              <p className="board-tasks">{board.tasks} tasks</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
