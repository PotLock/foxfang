import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Bot, Plus, Circle, Power } from 'lucide-react'

interface Agent {
  id: number
  name: string
  role: string
  status: 'online' | 'offline'
  tasks: number
}

export default function Agents() {
  const { apiFetch } = useAuth()
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await apiFetch('/agents')
        if (response.ok) {
          const data = await response.json()
          setAgents(data)
        }
      } catch (error) {
        console.error('Failed to load agents:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadAgents()
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
          <Bot className="w-10 h-10 text-fox-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Agents</h1>
            <p className="text-text-secondary">Manage your AI marketing agents</p>
          </div>
        </div>
        
        <button className="flex items-center gap-2 px-5 py-2.5 bg-fox-primary text-white rounded-lg hover:bg-fox-primary-hover transition-all duration-fast">
          <Plus className="w-5 h-5" />
          New Agent
        </button>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map(agent => (
          <div key={agent.id} className="bg-bg-secondary border border-border-default rounded-xl p-6 hover:border-fox-primary hover:shadow-md transition-all duration-fast">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-fox-primary to-fox-primary-hover rounded-xl flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              
              <Circle 
                className={`w-3 h-3 ${agent.status === 'online' ? 'text-success' : 'text-text-muted'}`}
                fill={agent.status === 'online' ? '#22c55e' : '#6e7681'}
              />
            </div>
            
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-text-primary mb-1">{agent.name}</h3>
              <p className="text-sm text-text-secondary capitalize">{agent.role}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 p-4 bg-bg-primary rounded-lg mb-5">
              <div className="text-center">
                <span className="block text-base font-semibold text-text-primary mb-1">{agent.tasks}</span>
                <span className="text-xs text-text-secondary uppercase">Tasks</span>
              </div>
              
              <div className="text-center">
                <span className="block text-base font-semibold text-text-primary mb-1 capitalize">{agent.status}</span>
                <span className="text-xs text-text-secondary uppercase">Status</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2.5 bg-bg-tertiary border border-border-default rounded-lg text-text-primary text-sm font-medium hover:bg-bg-hover hover:border-fox-primary transition-all duration-fast cursor-pointer">
                Configure
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast cursor-pointer">
                <Power className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
