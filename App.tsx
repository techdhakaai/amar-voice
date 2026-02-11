
import React, { useState, useEffect } from 'react';
import { AppView, AnalyticsData, BusinessConfig, SentimentPoint } from './types';
import VoiceInterface from './components/VoiceInterface';

const SENTIMENT_DATA: SentimentPoint[] = [
  { day: 'Sat', positive: 70, negative: 30 },
  { day: 'Sun', positive: 85, negative: 15 },
  { day: 'Mon', positive: 65, negative: 35 },
  { day: 'Tue', positive: 90, negative: 10 },
  { day: 'Wed', positive: 88, negative: 12 },
  { day: 'Thu', positive: 72, negative: 28 },
  { day: 'Fri', positive: 95, negative: 5 }
];

const KEYWORDS = ["বিকাশ", "ডেলিভারি", "রিটার্ন", "অর্ডার", "দেরি", "ধন্যবাদ", "প্রাইস"];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [config, setConfig] = useState<BusinessConfig>({
    shopName: 'Deshi Bazar',
    deliveryInsideDhaka: 60,
    deliveryOutsideDhaka: 120,
    paymentMethods: ['bKash', 'Nagad', 'Cash on Delivery'],
    returnPolicy: '7-day return if the product is defective.',
    bkashNumber: '01700000000',
    personaTone: 'friendly',
    subscriptionStatus: 'trial',
    monthlyLimit: 100,
    usageCount: 24
  });

  const [readiness, setReadiness] = useState({ micAccess: false, configSaved: true, voiceCloned: true });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => setReadiness(prev => ({ ...prev, micAccess: true })))
      .catch(() => setReadiness(prev => ({ ...prev, micAccess: false })));
  }, []);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-['Hind_Siliguri']">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-10">
          <h1 className="text-2xl font-black italic flex items-center gap-3">
            <span className="bg-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center not-italic text-sm">AV</span> AMAR VOICE
          </h1>
        </div>
        <nav className="flex-1 px-6 space-y-2">
          {[
            { view: AppView.DASHBOARD, icon: 'fa-grid-2', label: 'Overview' },
            { view: AppView.VOICE_AGENT, icon: 'fa-microphone', label: 'Agent Control' },
            { view: AppView.MARKET_INSIGHTS, icon: 'fa-chart-line', label: 'Market Insights' },
            { view: AppView.SETUP, icon: 'fa-wand-magic-sparkles', label: 'How To Setup' },
            { view: AppView.SETTINGS, icon: 'fa-sliders', label: 'Knowledge Base' },
            { view: AppView.SUBSCRIPTION, icon: 'fa-credit-card', label: 'Billing' }
          ].map(item => (
            <button key={item.view} onClick={() => { setCurrentView(item.view); setIsSidebarOpen(false); }} className={`w-full text-left px-5 py-3.5 rounded-2xl flex items-center gap-4 transition-all ${currentView === item.view ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <i className={`fa-solid ${item.icon} text-xs`}></i> <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">{currentView.replace(/_/g, ' ')}</h2>
          <button onClick={() => setShowVoiceInterface(true)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Live Test Agent</button>
        </header>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          {currentView === AppView.DASHBOARD && (
            <div className="space-y-10 animate-in fade-in duration-700">
               <div className="bg-slate-900 rounded-[40px] p-12 text-white flex justify-between items-center relative overflow-hidden group">
                  <div className="relative z-10">
                    <h1 className="text-4xl font-black mb-4">Hello, {config.shopName}!</h1>
                    <p className="text-slate-400 font-medium max-w-lg leading-relaxed">Your AI Agent managed 24 calls today with a 98% satisfaction rate.</p>
                  </div>
                  <div className="hidden lg:flex w-24 h-24 bg-white/5 rounded-full items-center justify-center border border-white/10 hover:scale-110 transition-transform">
                     <i className="fa-solid fa-bolt-lightning text-3xl text-indigo-400"></i>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                    <h3 className="text-xl font-black mb-6">Integration Health</h3>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between p-5 bg-green-50 rounded-3xl border border-green-100">
                          <span className="text-sm font-black text-green-700">LIVE SERVER ACTIVE</span>
                          <span className="text-[10px] font-bold text-green-600">9ms Latency</span>
                       </div>
                       <div className="bg-slate-950 p-6 rounded-3xl font-mono text-[10px] text-indigo-300 relative group overflow-hidden">
                          <code>{`<script src="https://api.amarvoice.com/v2/bot.js?id=deshibazar"></script>`}</code>
                       </div>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm relative group cursor-pointer" onClick={() => setCurrentView(AppView.MARKET_INSIGHTS)}>
                     <h3 className="text-xl font-black mb-2">Sentiment Alert</h3>
                     <p className="text-slate-500 text-sm mb-6">"Customers are asking for faster delivery in Chittagong."</p>
                     <div className="flex items-end gap-2 h-24">
                        {SENTIMENT_DATA.slice(-5).map(d => (
                          <div key={d.day} className="flex-1 bg-indigo-500 rounded-t-lg transition-all hover:bg-orange-500" style={{ height: `${d.positive}%` }}></div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {currentView === AppView.MARKET_INSIGHTS && (
            <div className="space-y-10 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                    <h3 className="text-xl font-black mb-8">Voice Sentiment Analysis</h3>
                    <div className="h-64 flex items-end gap-4 border-b border-slate-100 pb-2">
                       {SENTIMENT_DATA.map(d => (
                         <div key={d.day} className="flex-1 flex flex-col justify-end group relative">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{d.positive}% Positive</div>
                            <div className="w-full bg-slate-100 rounded-t-xl overflow-hidden flex flex-col-reverse" style={{ height: '100%' }}>
                               <div className="w-full bg-red-400" style={{ height: `${d.negative}%` }}></div>
                               <div className="w-full bg-indigo-500" style={{ height: `${d.positive}%` }}></div>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 text-center mt-3 uppercase tracking-widest">{d.day}</p>
                         </div>
                       ))}
                    </div>
                    <div className="mt-8 flex gap-6">
                       <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500"></div> <span className="text-xs font-bold text-slate-500">Positive Experience</span></div>
                       <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div> <span className="text-xs font-bold text-slate-500">Negative Experience</span></div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm flex flex-col">
                    <h3 className="text-xl font-black mb-8">Popular Keywords</h3>
                    <div className="flex flex-wrap gap-2">
                       {KEYWORDS.map((k, i) => (
                         <span key={k} className={`px-4 py-2 rounded-2xl font-black transition-all hover:scale-110 cursor-default ${i === 0 ? 'bg-orange-100 text-orange-600 text-lg' : i === 1 ? 'bg-indigo-100 text-indigo-600 text-md' : 'bg-slate-100 text-slate-600 text-xs'}`}>{k}</span>
                       ))}
                    </div>
                    <div className="mt-auto pt-10">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Trend Analysis</p>
                       <p className="text-sm font-bold text-slate-700 leading-relaxed">Payment inquiries increased by <span className="text-green-600">+12%</span> this week. Recommend adding "Nagad" support.</p>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {currentView === AppView.SETUP && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div className="text-center max-w-2xl mx-auto">
                  <h1 className="text-4xl font-black mb-4">Launch Your Voice Bot in 5 Minutes</h1>
                  <p className="text-slate-500 font-bold">Follow this simple guide to integrate Amar Voice AI with your online store and social channels.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { step: 1, title: 'Knowledge Base', icon: 'fa-book-open', desc: 'Fill your store info in Settings.' },
                    { step: 2, title: 'Voice Calibration', icon: 'fa-sliders', desc: 'Select accent & test the bot live.' },
                    { step: 3, title: 'Embed Code', icon: 'fa-code', desc: 'Copy snippet to your website.' },
                    { step: 4, title: 'Connect FB', icon: 'fa-facebook-messenger', desc: 'Link Messenger for auto-replies.' }
                  ].map(s => (
                    <div key={s.step} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center text-center group hover:border-indigo-500 transition-all">
                       <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 font-black text-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">{s.step}</div>
                       <i className={`fa-solid ${s.icon} text-2xl text-slate-300 mb-4 group-hover:text-indigo-500`}></i>
                       <h4 className="font-black text-slate-800 mb-2">{s.title}</h4>
                       <p className="text-xs font-bold text-slate-500 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
                     <h3 className="text-xl font-black mb-8 flex items-center gap-3"><i className="fa-solid fa-laptop-code text-indigo-500"></i> Website Integration</h3>
                     <p className="text-sm font-bold text-slate-600 mb-6">Works with <span className="text-indigo-600">Shopify</span>, <span className="text-indigo-600">WooCommerce</span>, and custom sites.</p>
                     
                     <div className="space-y-6">
                        <div className="bg-slate-900 rounded-3xl p-6 relative overflow-hidden group">
                           <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Header Script</span>
                              <button className="text-[10px] font-black text-white bg-indigo-600 px-3 py-1 rounded-lg hover:bg-indigo-700 transition-all active:scale-95">Copy Script</button>
                           </div>
                           <pre className="text-xs text-indigo-200 font-mono leading-relaxed">
{`<!-- Amar Voice Widget -->
<script>
  window.AmarVoiceConfig = {
    appId: "deshibazar_772",
    theme: "indigo_modern"
  };
</script>
<script src="https://cdn.amarvoice.com/v1/bot.js" async></script>`}
                           </pre>
                        </div>
                        <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                           <h5 className="text-xs font-black text-indigo-700 uppercase mb-2 flex items-center gap-2">
                              <i className="fa-solid fa-circle-info"></i> Pro Tip
                           </h5>
                           <p className="text-xs font-bold text-indigo-600 leading-relaxed">Paste this code right before the closing <code>&lt;/head&gt;</code> tag of your website theme.</p>
                        </div>
                     </div>
                  </div>

                  <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                     <h3 className="text-xl font-black mb-8 flex items-center gap-3"><i className="fa-solid fa-mobile-screen text-orange-500"></i> Visual Mockup</h3>
                     <div className="flex-1 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 relative flex items-center justify-center p-6">
                        <div className="w-full max-w-[200px] aspect-[9/18] bg-white rounded-[32px] border-[6px] border-slate-800 shadow-2xl relative overflow-hidden flex flex-col">
                           <div className="h-6 w-full bg-slate-800 flex items-center justify-center">
                              <div className="h-2 w-10 bg-slate-700 rounded-full"></div>
                           </div>
                           <div className="flex-1 p-3 bg-slate-50">
                              <div className="h-4 w-2/3 bg-slate-200 rounded-md mb-2"></div>
                              <div className="h-24 w-full bg-slate-100 rounded-xl mb-3"></div>
                              <div className="h-4 w-full bg-slate-200 rounded-md mb-2"></div>
                              <div className="h-4 w-5/6 bg-slate-200 rounded-md"></div>
                           </div>
                           {/* The Widget Mockup */}
                           <div className="absolute bottom-4 right-4 animate-bounce">
                              <div className="w-10 h-10 bg-indigo-600 rounded-2xl shadow-xl flex items-center justify-center text-white text-xs border-2 border-white ring-4 ring-indigo-500/20">
                                 <i className="fa-solid fa-microphone"></i>
                              </div>
                           </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 bg-orange-500 text-white px-5 py-3 rounded-2xl shadow-xl transform rotate-3 animate-pulse">
                           <p className="text-[10px] font-black uppercase">Live Result</p>
                        </div>
                     </div>
                     <p className="mt-8 text-[11px] font-bold text-slate-400 text-center leading-relaxed">This is how your customers will see the floating voice agent on your mobile store.</p>
                  </div>
               </div>

               <div className="bg-indigo-600 rounded-[40px] p-12 text-white flex flex-col lg:flex-row items-center justify-between gap-10">
                  <div className="max-w-xl text-center lg:text-left">
                     <h2 className="text-3xl font-black mb-4">Need personalized setup?</h2>
                     <p className="text-indigo-100 font-bold leading-relaxed">Our Bangladeshi support team can help you integrate the bot via WhatsApp or screen share.</p>
                  </div>
                  <div className="flex items-center gap-4">
                     <button className="px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-black/20 hover:scale-105 active:scale-95 transition-all">Book Free Session</button>
                     <button className="px-8 py-4 bg-indigo-500 text-white border border-white/20 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all">Watch Video Tutorial</button>
                  </div>
               </div>
            </div>
          )}

          {currentView === AppView.SETTINGS && (
            <div className="max-w-4xl mx-auto bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
               <h3 className="text-xl font-black mb-10 flex items-center gap-3"><i className="fa-solid fa-brain text-indigo-500"></i> Knowledge Base</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Shop Name</label>
                       <input name="shopName" value={config.shopName} onChange={handleConfigChange} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-all" />
                     </div>
                     <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Refund Policy</label>
                       <textarea name="returnPolicy" value={config.returnPolicy} onChange={handleConfigChange} rows={4} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-all resize-none" />
                     </div>
                  </div>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Inside Dhaka (৳)</label>
                         <input name="deliveryInsideDhaka" type="number" value={config.deliveryInsideDhaka} onChange={handleConfigChange} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
                       </div>
                       <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Outside Dhaka (৳)</label>
                         <input name="deliveryOutsideDhaka" type="number" value={config.deliveryOutsideDhaka} onChange={handleConfigChange} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
                       </div>
                    </div>
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">bKash Merchant</label>
                       <input name="bkashNumber" value={config.bkashNumber} onChange={handleConfigChange} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" />
                    </div>
                  </div>
               </div>
               <div className="mt-12 flex justify-end">
                  <button className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all">Synchronize Knowledge</button>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating Messenger Preview Mockup */}
      <div className="fixed bottom-10 right-10 z-40 lg:flex flex-col items-end gap-4 hidden pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
         <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 w-64 pointer-events-auto">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
               <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center"><i className="fa-brands fa-facebook-messenger text-[10px] text-white"></i></div>
               <span className="text-[10px] font-black text-slate-400 uppercase">FB Integration</span>
            </div>
            <div className="space-y-2">
               <div className="bg-slate-100 p-2 rounded-xl text-[10px] font-bold text-slate-600">আমাদের পেমেন্ট মেথডগুলো কি?</div>
               <div className="bg-indigo-600 p-2 rounded-xl text-[10px] font-bold text-white text-right">আমরা বিকাশ, নগদ এবং ক্যাশ অন ডেলিভারি সাপোর্ট করি।</div>
            </div>
         </div>
      </div>

      {showVoiceInterface && (
        <VoiceInterface config={config} onClose={() => setShowVoiceInterface(false)} />
      )}
    </div>
  );
};

export default App;
