import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, PlusCircle, Users, Settings, LogOut, Menu, X } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  const navItems = [
    { icon: Users, label: 'Influencers', path: '/' },
    { icon: PlusCircle, label: 'Create New', path: '/create' },
    { icon: LayoutGrid, label: 'Templates', path: '/templates' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-[#030014] overflow-hidden">
      {/* Sidebar for Desktop */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 glass border-r border-white/10 transition-transform duration-300 transform 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:inset-0`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-12 px-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <span className="text-white font-bold">A</span>
            </div>
            <h1 className="text-2xl font-bold gradient-text">Aura</h1>
            <button 
              className="md:hidden ml-auto text-gray-400 hover:text-white"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                  ${isActive(item.path) 
                    ? 'bg-white/10 text-white shadow-lg shadow-white/5' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <item.icon size={20} className={isActive(item.path) ? 'text-purple-400' : 'group-hover:text-purple-400'} />
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          <button className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 transition-colors mt-auto">
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-y-auto scroll-smooth">
        {/* Header (Mobile Only) */}
        <header className="md:hidden flex items-center justify-between p-4 glass border-b border-white/10 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold">A</span>
            </div>
          </div>
          <button 
            className="text-gray-400 hover:text-white p-2"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
