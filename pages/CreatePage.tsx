/**
 * CreatePage - Entry point for the multi-step influencer creation flow.
 * Uses the new session-based CreationFlow with background processing.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreationFlow } from '../components/creation/CreationFlow';
import { useInfluencers } from '../services/InfluencerContext';
import { useToast } from '../services/ToastContext';

const CreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshData } = useInfluencers();
  const { showToast } = useToast();

  const handleComplete = async (influencerId: string) => {
    showToast('Influencer created successfully!', 'success');
    // Refresh the influencer list to include the new one
    await refreshData();
    navigate(`/dashboard/${influencerId}`);
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <CreationFlow 
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  );
};

export default CreatePage;
