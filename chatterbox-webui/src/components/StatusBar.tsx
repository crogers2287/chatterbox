import React, { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { chatterboxAPI } from '@/lib/api';
import { Activity, Cpu, HardDrive, CheckCircle, XCircle, Server, Sparkles, Brain } from 'lucide-react';

interface EngineStatus {
  current_active_engine: string | null;
  gpu_memory: {
    allocated_gb: number;
    total_gb: number;
    usage_percent: number;
  };
}

export function StatusBar() {
  const { systemStatus, updateSystemStatus, ttsEngine } = useStore();
  const [apiUrl, setApiUrl] = useState<string>('');
  const [serverInfo, setServerInfo] = useState<string>('');
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    // Get API URL - updated for unified server
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    setApiUrl(baseUrl);
    setServerInfo('GPU Unified Server');

    const checkHealth = async () => {
      try {
        const health = await chatterboxAPI.health();
        updateSystemStatus({
          healthy: health.status === 'healthy',
          gpuAvailable: health.gpu_available,
          modelLoaded: health.model_loaded,
        });
        
        // Get engine status
        const response = await fetch(`${baseUrl}/engines`);
        if (response.ok) {
          const engines = await response.json();
          setEngineStatus({
            current_active_engine: engines.current_active_engine,
            gpu_memory: engines.gpu_memory
          });
        }
      } catch (error) {
        console.error('Failed to connect to TTS API:', error);
        updateSystemStatus({
          healthy: false,
          gpuAvailable: false,
          modelLoaded: false,
        });
      }
    };

    // Check immediately
    checkHealth();

    // Check every 10 seconds for faster updates
    const interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, [updateSystemStatus]);

  const getEngineIcon = (engine: string | null) => {
    if (engine === 'chatterbox') return <Sparkles className="h-4 w-4" />;
    if (engine === 'vibevoice') return <Brain className="h-4 w-4" />;
    return <Server className="h-4 w-4" />;
  };

  const getEngineColor = (engine: string | null) => {
    if (engine === ttsEngine) return 'text-green-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t text-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${systemStatus.healthy ? 'text-green-500' : 'text-red-500'}`} />
          <span className={systemStatus.healthy ? 'text-green-500' : 'text-red-500'}>
            {systemStatus.healthy ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {systemStatus.gpuAvailable && (
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-blue-500" />
            <span>GPU</span>
            {engineStatus?.gpu_memory && (
              <span className="text-muted-foreground">
                ({engineStatus.gpu_memory.allocated_gb}GB / {engineStatus.gpu_memory.total_gb}GB - {engineStatus.gpu_memory.usage_percent}%)
              </span>
            )}
          </div>
        )}

        {engineStatus?.current_active_engine && (
          <div className="flex items-center gap-2">
            {getEngineIcon(engineStatus.current_active_engine)}
            <span className={getEngineColor(engineStatus.current_active_engine)}>
              {engineStatus.current_active_engine === 'chatterbox' ? 'Chatterbox' : 'VibeVoice'} Active
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          <span>{serverInfo}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>API: {apiUrl}</span>
        {systemStatus.modelLoaded ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
      </div>
    </div>
  );
}