import Link from 'next/link';
import { ArrowRight, Sparkles, Zap, Target, Users, BarChart3, CheckCircle } from 'lucide-react';

const features = [
  {
    title: 'AI-Powered Agents',
    description: 'Deploy autonomous marketing agents that work 24/7 to execute your campaigns.',
    icon: Zap,
    color: 'bg-amber-50 text-amber-600'
  },
  {
    title: 'Campaign Management',
    description: 'Plan, execute, and track multi-channel marketing campaigns from one dashboard.',
    icon: Target,
    color: 'bg-blue-50 text-blue-600'
  },
  {
    title: 'Team Collaboration',
    description: 'Work seamlessly with your team and AI agents on shared projects.',
    icon: Users,
    color: 'bg-indigo-50 text-indigo-600'
  },
  {
    title: 'Real-time Analytics',
    description: 'Monitor performance metrics and optimize your marketing efforts.',
    icon: BarChart3,
    color: 'bg-emerald-50 text-emerald-600'
  }
];

const benefits = [
  'Automate repetitive marketing tasks',
  'Generate content at scale with AI',
  'Track campaign performance in real-time',
  'Collaborate with AI agents seamlessly',
  'Manage multiple projects from one place'
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">FoxFang</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </Link>
              <Link href="#benefits" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Benefits
              </Link>
              <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Login
              </Link>
            </div>

            <Link 
              href="/login"
              className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full mb-6">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                <span className="text-sm text-indigo-700 font-medium">AI-Powered Marketing Platform</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
                Scale your marketing<br />
                with autonomous<br />
                AI agents
              </h1>
              
              <p className="text-gray-600 mb-8 max-w-md text-base leading-relaxed">
                FoxFang helps you plan, execute, and optimize marketing campaigns 
                with AI agents that work alongside your team.
              </p>
              
              <div className="flex items-center gap-4">
                <Link 
                  href="/login"
                  className="inline-flex items-center px-6 py-3 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
                <Link 
                  href="/login"
                  className="inline-flex items-center px-6 py-3 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  View Demo
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-6 mt-8 pt-8 border-t border-gray-100">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white" />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <svg key={i} className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20">
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Trusted by 500+ teams</p>
                </div>
              </div>
            </div>
            
            {/* Hero Illustration */}
            <div className="relative flex items-center justify-center">
              <div className="relative w-full max-w-md">
                {/* Main card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Content Agent</p>
                      <p className="text-xs text-gray-500">Working on task...</p>
                    </div>
                    <span className="ml-auto w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  </div>
                  
                  <div className="space-y-3">
                    <div className="h-2 bg-gray-100 rounded-full w-full" />
                    <div className="h-2 bg-gray-100 rounded-full w-4/5" />
                    <div className="h-2 bg-gray-100 rounded-full w-3/5" />
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    <div className="px-2 py-1 bg-emerald-50 rounded-lg text-xs text-emerald-700">SEO</div>
                    <div className="px-2 py-1 bg-blue-50 rounded-lg text-xs text-blue-700">Content</div>
                    <div className="px-2 py-1 bg-purple-50 rounded-lg text-xs text-purple-700">Social</div>
                  </div>
                </div>

                {/* Floating cards */}
                <div className="absolute -top-4 -right-4 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">Task Completed</p>
                      <p className="text-[10px] text-gray-500">2 minutes ago</p>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-4 -left-4 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                      <Target className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">Campaign Ready</p>
                      <p className="text-[10px] text-gray-500">Review pending</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full mb-4">
              Features
            </span>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything you need to scale
            </h2>
            <p className="text-gray-600 max-w-lg mx-auto">
              From campaign planning to execution, our platform provides all the tools 
              you need to grow your marketing efforts.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-gray-300 transition-colors"
              >
                <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full mb-4">
                Why FoxFang
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Work smarter, not harder
              </h2>
              <p className="text-gray-600 mb-8">
                Let AI agents handle the repetitive tasks while you focus on strategy 
                and creative decisions that drive growth.
              </p>

              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                    </div>
                    <span className="text-gray-700 text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>

              <Link 
                href="/login"
                className="inline-flex items-center mt-8 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-gray-900">Campaign Performance</h3>
                  <span className="text-xs text-emerald-600 font-medium">+24.5%</span>
                </div>

                {/* Mini chart */}
                <div className="flex items-end gap-2 h-32 mb-6">
                  {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                    <div 
                      key={i}
                      className="flex-1 bg-indigo-100 rounded-t-lg"
                      style={{ height: `${height}%` }}
                    >
                      <div 
                        className="w-full bg-indigo-500 rounded-t-lg transition-all"
                        style={{ height: `${Math.random() * 100}%` }}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">12</p>
                    <p className="text-xs text-gray-500">Active Campaigns</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">48</p>
                    <p className="text-xs text-gray-500">Tasks Completed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">8</p>
                    <p className="text-xs text-gray-500">AI Agents</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-10 md:p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to scale your marketing?
            </h2>
            <p className="text-indigo-100 max-w-lg mx-auto mb-8">
              Join hundreds of teams using FoxFang to automate their marketing workflows 
              and achieve better results with less effort.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link 
                href="/login"
                className="inline-flex items-center px-6 py-3 bg-white text-indigo-600 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link 
                href="/login"
                className="inline-flex items-center px-6 py-3 bg-indigo-400/30 text-white text-sm font-medium rounded-xl hover:bg-indigo-400/50 transition-colors"
              >
                View Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">FoxFang</span>
            </div>
            
            <p className="text-sm text-gray-500">
              © 2026 FoxFang. All rights reserved.
            </p>
            
            <div className="flex items-center gap-6">
              <Link href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Terms</Link>
              <Link href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Privacy</Link>
              <Link href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
