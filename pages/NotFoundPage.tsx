import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Ghost, Home, ArrowLeft } from 'lucide-react';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 space-y-8 animate-in fade-in duration-700">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500/20 blur-[100px] rounded-full animate-pulse"></div>
        <div className="relative w-32 h-32 bg-white/5 rounded-[2.5rem] flex items-center justify-center text-indigo-400 border border-white/10 shadow-2xl">
          <Ghost size={64} strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-3">
        <h1 className="text-6xl font-black text-white tracking-tighter">404</h1>
        <h2 className="text-2xl font-bold text-gray-300">Lost in the Vibe?</h2>
        <p className="text-gray-500 max-w-xs mx-auto text-lg leading-relaxed">
          The page you're searching for seems to have vanished into the digital aether.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all active:scale-95 border border-white/10"
        >
          <ArrowLeft size={20} />
          Go Back
        </button>
        <button 
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-white text-black rounded-2xl font-black hover:bg-gray-200 transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
        >
          <Home size={20} />
          Return Home
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;
