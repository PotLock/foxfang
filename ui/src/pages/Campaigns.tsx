import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Target, Plus, Play, Pause, MoreHorizontal } from 'lucide-react'

interface Campaign {
  id: number
  name: string
  status: 'active' | 'paused' | 'draft'
  progress: number
  budget: string
}

export default function Campaigns() {
  const { apiFetch } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        const response = await apiFetch('/campaigns')
        if (response.ok) {
          const data = await response.json()
          setCampaigns(data)
        }
      } catch (error) {
        console.error('Failed to load campaigns:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadCampaigns()
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
          <Target className="w-10 h-10 text-fox-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Campaigns</h1>
            <p className="text-text-secondary">Manage your marketing campaigns</p>
          </div>
        </div>
        
        <button className="flex items-center gap-2 px-5 py-2.5 bg-fox-primary text-white rounded-lg hover:bg-fox-primary-hover transition-all duration-fast">
          <Plus className="w-5 h-5" />
          New Campaign
        </button>
      </header>
      
      <div className="flex flex-col gap-4">
        {campaigns.map(campaign => (
          <div key={campaign.id} className="flex items-center gap-6 bg-bg-secondary border border-border-default rounded-xl p-6 hover:border-fox-primary hover:shadow-md transition-all duration-fast">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-text-primary mb-2">{campaign.name}</h3>
              <div className="flex items-center gap-4">
                <span className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase ${
                  campaign.status === 'active' 
                    ? 'bg-success/10 text-success-text'
                    : campaign.status === 'paused'
                    ? 'bg-warning/10 text-warning-text'
                    : 'bg-bg-tertiary text-text-secondary'
                }`}>
                  {campaign.status}
                </span>
                <span className="text-sm text-text-secondary">{campaign.budget}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 min-w-[200px]">
              <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-fox-primary to-fox-primary-hover rounded-full transition-all duration-base"
                  style={{ width: `${campaign.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-text-secondary min-w-[40px] text-right">{campaign.progress}%</span>
            </div>
            
            <div className="flex gap-2">
              <button className="w-9 h-9 flex items-center justify-center bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast cursor-pointer">
                {campaign.status === 'active' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button className="w-9 h-9 flex items-center justify-center bg-transparent border-none rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-fast cursor-pointer">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
