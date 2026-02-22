
import React, { useState, useEffect, useMemo } from 'react';
import { AppView, BusinessConfig, Lead, MarketPrice } from './types';
import VoiceInterface from './components/VoiceInterface';
import { GoogleGenAI } from '@google/genai';

// Firebase Imports
// @google/genai-fix: Changed Firebase `initializeApp` import to use a namespace import for broader compatibility.
import * as firebaseApp from 'firebase/app'; 
import { getFirestore, collection, addDoc, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';

// --- Firebase Configuration from Environment Variables ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase configuration is incomplete. Please set environment variables.');
}

// Initialize Firebase once
const app = firebaseApp.initializeApp(firebaseConfig);
const db = getFirestore(app);
// -------- END FIREBASE CONFIGURATION --------

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]); // Initialize as empty, fetched from Firestore
  const [isLoadingLeads, setIsLoadingLeads] = useState(true); // New loading state for leads
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [config, setConfig] = useState<BusinessConfig>(() => {
    const saved = localStorage.getItem('amar_config');
    return saved ? JSON.parse(saved) : {
      shopName: 'My Online Store',
      deliveryInsideDhaka: 60,
      deliveryOutsideDhaka: 120,
      paymentMethods: ['bKash', 'Nagad', 'Cash on Delivery'],
      returnPolicy: '7-day return policy.',
      bkashNumber: '01XXXXXXXXX',
      personaTone: 'friendly',
      subscriptionStatus: 'trial',
      monthlyLimit: 100,
      usageCount: 0
    };
  });

  useEffect(() => {
    localStorage.setItem('amar_config', JSON.stringify(config));
  }, [config]);

  // Fetch leads from Firestore on component mount
  useEffect(() => {
    const fetchLeads = async () => {
      setIsLoadingLeads(true);
      try {
        const q = query(collection(db, "leads"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedLeads: Lead[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || 'N/A',
            phone: data.phone,
            location: data.location || 'N/A',
            interest: data.interest || 'N/A',
            timestamp: data.timestamp.toDate() // Convert Firebase Timestamp to Date
          };
        });
        setLeads(fetchedLeads);
      } catch (error) {
        console.error("Error fetching leads from Firestore:", error);
        // Optionally, fall back to local storage or display an error message
        const saved = localStorage.getItem('amar_leads');
        setLeads(saved ? JSON.parse(saved).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })) : []);
      } finally {
        setIsLoadingLeads(false);
      }
    };

    fetchLeads();
  }, []); // Run once on mount

  const handleLeadCaptured = async (newLead: Lead) => {
    try {
      // Add lead to Firestore
      const docRef = await addDoc(collection(db, "leads"), {
        name: newLead.name || 'N/A',
        phone: newLead.phone,
        location: newLead.location || 'N/A',
        interest: newLead.interest || 'N/A',
        timestamp: Timestamp.fromDate(newLead.timestamp) // Store as Firebase Timestamp
      });
      // Update local state with the Firestore-assigned ID
      setLeads(prev => [{ ...newLead, id: docRef.id }, ...prev]);
    } catch (error) {
      console.error("Error saving lead to Firestore:", error);
      // Fallback: If Firestore fails, still update local state
      setLeads(prev => [{ ...newLead, id: Math.random().toString(36).substring(2, 9) }, ...prev]);
    }
  };

  const exportToWhatsApp = (lead: Lead) => {
    const text = `*New Customer Lead from Amar Voice*%0A%0AName: ${lead.name || 'N/A'}%0APhone: ${lead.phone}%0AInterest: ${lead.interest || 'N/A'}%0ALocation: ${lead.location || 'N/A'}`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handlePriceSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Latest price of "${searchQuery}" in Bangladesh (Taka). Summarize from Daraz/Star Tech/Pickaboo.`,
        config: { tools: [{ googleSearch: {} }] }
      });
      
      const newPrice: MarketPrice = {
        product: searchQuery,
        source: 'AI Intelligence',
        price: response.text || 'Price details unavailable.',
        link: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri || '#'
      };
      setMarketPrices(prev => [newPrice, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const NavItem = ({ view, icon, label }: { view: AppView, icon: string, label: string }) => (
    <button 
      onClick={() => setCurrentView(view)} 
      className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-4 rounded-2xl transition-all flex-1 md:flex-none ${currentView === view ? 'text-indigo-600 md:bg-indigo-600 md:text-white' : 'text-slate-400 hover:bg-slate-100 md:hover:bg-white/5'}`}
    >
      <i className={`fa-solid ${icon} text-lg md:text-xs`}></i>
      <span className="text-[10px] md:text-sm font-bold">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col p-6 gap-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black">A</div>
          <h1 className="text-xl font-black italic">AMAR VOICE</h1>
        </div>
        <nav className="flex flex-col gap-2">
          <NavItem view={AppView.DASHBOARD} icon="fa-house" label="Home" />
          <NavItem view={AppView.LEADS} icon="fa-address-book" label="Leads" />
          <NavItem view={AppView.PRICE_TRACKER} icon="fa-tag" label="Prices" />
          <NavItem view={AppView.SETTINGS} icon="fa-sliders" label="Setup" />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-16 md:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-10 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="md:hidden text-lg font-black text-indigo-600 italic">AMAR VOICE</h1>
            <h2 className="hidden md:block text-sm font-black text-slate-400 uppercase tracking-widest">{currentView}</h2>
          </div>
          <button 
            onClick={() => setShowVoiceInterface(true)} 
            className="h-10 px-4 md:px-6 bg-indigo-600 text-white rounded-full md:rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2"
          >
            <i className="fa-solid fa-microphone"></i>
            <span className="hidden xs:inline">Talk to AI</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 hide-scrollbar pb-24 md:pb-10">
          {currentView === AppView.DASHBOARD && (
            <div className="space-y-6">
              <div className="bg-indigo-600 rounded-[32px] md:rounded-[40px] p-6 md:p-10 text-white shadow-xl">
                <h1 className="text-2xl md:text-3xl font-black mb-2">Shubho Shokal!</h1>
                <p className="opacity-80 text-sm">Managing <b>{config.shopName}</b>. {leads.length} leads waiting for you.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                   <p className="text-[10px] font-black text-slate-400 uppercase">Total Leads</p>
                   <p className="text-2xl font-black text-slate-800">{leads.length}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                   <p className="text-[10px] font-black text-slate-400 uppercase">Usage</p>
                   <p className="text-2xl font-black text-slate-800">{config.usageCount}%</p>
                </div>
              </div>
            </div>
          )}

          {currentView === AppView.LEADS && (
            <div className="space-y-6">
              <h3 className="text-xl font-black flex items-center gap-2">
                <i className="fa-solid fa-bolt text-amber-500"></i> New Customer Requests
              </h3>
              {isLoadingLeads ? (
                <div className="flex items-center justify-center p-10 text-slate-500">
                  <i className="fa-solid fa-spinner fa-spin mr-3"></i> Loading leads...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {leads.map(lead => (
                    <div key={lead.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:ring-2 hover:ring-indigo-100 transition-all flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="font-black text-slate-800">{lead.name || 'Anonymous User'}</h4>
                        <p className="text-indigo-600 font-bold text-sm">{lead.phone}</p>
                        <p className="text-xs text-slate-500 line-clamp-1 italic">Int: {lead.interest}</p>
                        <p className="text-xs text-slate-400">Loc: {lead.location}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => exportToWhatsApp(lead)}
                          className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-100 transition-colors"
                          aria-label={`Share lead ${lead.name || lead.phone} to WhatsApp`}
                        >
                          <i className="fa-brands fa-whatsapp"></i>
                        </button>
                        <a 
                          href={`tel:${lead.phone}`}
                          className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors"
                          aria-label={`Call lead ${lead.name || lead.phone}`}
                        >
                          <i className="fa-solid fa-phone"></i>
                        </a>
                      </div>
                    </div>
                  ))}
                  {leads.length === 0 && (
                    <div className="col-span-full p-6 text-center text-slate-500 italic">
                      No leads captured yet. Start a conversation with the AI!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentView === AppView.PRICE_TRACKER && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-100 shadow-sm">
                 <h3 className="text-lg font-black mb-4">Competitor Price Search</h3>
                 <div className="flex flex-col gap-3">
                   <input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. Samsung A54 Price" 
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                   />
                   <button 
                    onClick={handlePriceSearch}
                    disabled={isSearching}
                    className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-all shadow-lg"
                   >
                     {isSearching ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-magnifying-glass mr-2"></i>}
                     {isSearching ? 'Searching...' : 'Check Market Prices'}
                   </button>
                 </div>
              </div>
              <div className="space-y-3">
                {marketPrices.map((p, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 animate-in slide-in-from-bottom-2 duration-300">
                    <p className="text-[10px] font-black text-indigo-500 uppercase">{p.product}</p>
                    <p className="text-sm font-bold text-slate-700 mt-2 whitespace-pre-wrap">{p.price}</p>
                    <a href={p.link} target="_blank" className="text-[10px] font-black text-slate-400 mt-2 inline-block hover:text-indigo-600">SOURCE: DARAZ/STAR TECH <i className="fa-solid fa-arrow-up-right-from-square ml-1"></i></a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentView === AppView.SETTINGS && (
            <div className="max-w-xl mx-auto bg-white p-6 md:p-10 rounded-[32px] border border-slate-100 shadow-sm">
               <h3 className="text-lg font-black mb-6">Store Setup</h3>
               <div className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase">Shop Name</label>
                   <input value={config.shopName} onChange={e => setConfig({...config, shopName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase">bKash Number</label>
                   <input value={config.bkashNumber} onChange={e => setConfig({...config, bkashNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="017XXXXXXXX" />
                 </div>
                 <button className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black mt-4 shadow-xl active:scale-95">Save Store Profile</button>
               </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 glass-morphism px-4 flex items-center justify-between z-40 safe-bottom">
          <NavItem view={AppView.DASHBOARD} icon="fa-house" label="Home" />
          <NavItem view={AppView.LEADS} icon="fa-users" label="Leads" />
          <NavItem view={AppView.PRICE_TRACKER} icon="fa-tags" label="Prices" />
          <NavItem view={AppView.SETTINGS} icon="fa-gear" label="Setup" />
        </nav>
      </main>

      {showVoiceInterface && (
        <VoiceInterface 
          config={config} 
          onClose={() => setShowVoiceInterface(false)} 
          onLeadCaptured={handleLeadCaptured}
        />
      )}
    </div>
  );
};

export default App;
