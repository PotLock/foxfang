import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { FolderKanban, Plus, MoreHorizontal } from 'lucide-react'

interface Board {
  id: number
  name: string
  tasks: number
  status: 'active' | 'paused'
}

export default function Boards() {
  const { apiFetch } = useAuth()
  const [boards, setBoards] = useState<Board[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const loadBoards = async () => {
      try {
        const response = await apiFetch('/boards')
        if (response.ok) {
          const data = await response.json()
          setBoards(data)
        }
      } catch (error) {
        console.error('Failed to load boards:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadBoards()
  }, [apiFetch])
  
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-10 h-10 border-3 border-bg-tertiary border-t-fox-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8 pb-6 border-b border-border-default">
        <div className="flex items-center gap-4">
          <FolderKanban className="w-10 h-10 text-fox-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Boards</h1>
            <p className="text-text-secondary">Manage your marketing boards and tasks</p>
          </div>
        </div>
        
        <button className="flex items-center gap-2 px-5 py-2.5 bg-fox-primary text-white rounded-lg hover:bg-fox-primary-hover transition-all duration-fast">
          <Plus className="w-5 h-5" />
          New Board
        </button>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {boards.map(board => (
          <div key={board.id} className="bg-bg-secondary border border-border-default rounded-xl p-6 hover:-translate-y-0.5 hover:shadow-md hover:border-fox-primary transition-all duration-fast cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">{board.name}</h3>
              <button className="w-8 h-8 flex items-center justify-center bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast cursor-pointer">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{board.tasks} tasks</span>
              <span className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase ${
                board.status === 'active' 
                  ? 'bg-success/10 text-success-text' 
                  : 'bg-warning/10 text-warning-text'
              }`}>
                {board.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
