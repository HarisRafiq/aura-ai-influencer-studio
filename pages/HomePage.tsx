import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, ArrowRight, Sparkles, LogIn } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { useInfluencers } from "../services/InfluencerContext";
import { useAuth } from "../services/AuthContext";
import { api } from "../services/api";
import { Button, Card, Badge } from "../components/ui";

const HomePage: React.FC = () => {
  const { influencers } = useInfluencers();
  const { isAuthenticated, login, logout } = useAuth();
  const navigate = useNavigate();

  const handleLoginSuccess = async (response: any) => {
    try {
      const res = await api.post("/auth/google", {
        token: response.credential,
      });
      login(res.token, res.user_id);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Aura AI Influencer Studio
          </h1>
          <p className="text-gray-400 text-xl max-w-lg mx-auto">
            Create, manage, and monetize your own digital personas with
            state-of-the-art AI.
          </p>
        </div>

        <Card variant="glass" className="p-10 border-purple-500/30">
          <div className="space-y-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <Sparkles size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">Join the Future</h2>
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={() => console.log("Login Failed")}
              theme="filled_blue"
              shape="pill"
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Welcome back, Creator
          </h2>
          <p className="text-gray-400">
            You have {influencers.length} active personas working for you.
          </p>
        </div>
        <div className="flex gap-4">
          <Button
            onClick={() => navigate("/create")}
            variant="secondary"
            icon={<Plus size={20} />}
          >
            Create New Persona
          </Button>
          <Button onClick={logout} variant="ghost" className="text-gray-400">
            Logout
          </Button>
        </div>
      </div>

      {influencers.length === 0 ? (
        <Card variant="glass" className="border-dashed border-2 py-20">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <Users size={40} className="text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              No influencers yet
            </h3>
            <p className="text-gray-400 mb-8 max-w-md">
              Start your journey by creating your first AI influencer persona
              with just a prompt.
            </p>
            <button
              onClick={() => navigate("/create")}
              className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-2 transition-colors"
            >
              Get started <ArrowRight size={18} />
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {influencers.map((inf) => (
            <Card
              key={inf.id}
              variant="glass-card"
              hover
              clickable
              onClick={() => navigate(`/dashboard/${inf.id}`)}
              className="group overflow-hidden"
            >
              <div className="aspect-[4/5] relative overflow-hidden">
                <img
                  src={inf.avatarUrl}
                  alt={inf.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#030014] via-transparent to-transparent opacity-80" />

                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="secondary" size="sm">
                      {inf.niche}
                    </Badge>
                  </div>
                  <h4 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">
                    {inf.name}
                  </h4>
                  <p className="text-gray-300 text-sm line-clamp-2 mt-2">
                    {inf.bio}
                  </p>
                </div>

                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                    <ArrowRight size={20} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomePage;
