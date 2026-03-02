import { useState, useEffect } from 'react';
import { useAI } from '../../lib/ai/ai-context';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AlertTriangle, Save, Cpu, HardDrive, Activity } from 'lucide-react';
import { ModelRegistry } from '../../lib/ai/engine/ModelRegistry';
import { ModelMetadata } from '../../lib/ai/engine/types';
import { Badge } from '../ui/badge';

export function DebugSettings() {
  const { isInitialized, orchestratorState } = useAI();
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [localKeys, setLocalKeys] = useState({
      openrouter: localStorage.getItem('VITE_OPENROUTER_API_KEY') || '',
      grok: localStorage.getItem('VITE_GROK_API_KEY') || '',
      google: localStorage.getItem('VITE_GOOGLE_API_KEY') || ''
  });

  useEffect(() => {
    if (isInitialized) {
        setModels(ModelRegistry.getAllModels());
    }
  }, [isInitialized]);

  const handleSaveKeys = () => {
      if (localKeys.openrouter) localStorage.setItem('VITE_OPENROUTER_API_KEY', localKeys.openrouter);
      else localStorage.removeItem('VITE_OPENROUTER_API_KEY');

      if (localKeys.grok) localStorage.setItem('VITE_GROK_API_KEY', localKeys.grok);
      else localStorage.removeItem('VITE_GROK_API_KEY');

      if (localKeys.google) localStorage.setItem('VITE_GOOGLE_API_KEY', localKeys.google);
      else localStorage.removeItem('VITE_GOOGLE_API_KEY');

      window.location.reload();
  };

  return (
    <div className="space-y-6">
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
        <CardHeader>
            <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                <CardTitle>Cognitive SDK Debugger</CardTitle>
            </div>
            <CardDescription>
                Monitor the real-time state of the AI Orchestrator and Memory Manager.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                        <Cpu className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Active Model</span>
                    </div>
                    <p className="font-mono text-sm truncate">{orchestratorState?.activeModelId || 'None'}</p>
                    <Badge variant="outline" className="mt-2">{orchestratorState?.currentTier}</Badge>
                </div>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                        <Activity className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Status</span>
                    </div>
                    <p className="text-sm font-bold flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isInitialized ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {isInitialized ? 'Operational' : 'Initializing...'}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">Failures: {orchestratorState?.failureCount || 0}</p>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
              <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-indigo-500" />
                  <CardTitle>Model Matrix</CardTitle>
              </div>
              <CardDescription>Available models from OpenRouter ranked by Tier.</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {models.length === 0 && <p className="text-center py-4 text-slate-400">No models fetched yet.</p>}
                  {models.sort((a,b) => a.tier.localeCompare(b.tier)).map(model => (
                      <div key={model.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <div className="flex flex-col">
                              <span className="text-xs font-medium">{model.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{model.id}</span>
                          </div>
                          <div className="flex gap-2 items-center">
                              {model.isReasoning && <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 text-[9px] h-4">Reasoning</Badge>}
                              <Badge variant="secondary" className="text-[9px] h-4">{model.tier.split('_')[1]}</Badge>
                              <Button 
                                size="sm" 
                                variant={orchestratorState?.activeModelId === model.id ? "default" : "outline"}
                                className="h-6 text-[10px] px-2"
                                onClick={() => {
                                    localStorage.setItem('preferred_model', model.id);
                                    window.location.reload();
                                }}
                              >
                                {orchestratorState?.activeModelId === model.id ? 'Active' : 'Select'}
                              </Button>
                          </div>
                      </div>
                  ))}
              </div>
          </CardContent>
      </Card>

      <Card>
          <CardHeader>
              <CardTitle>API Key Configuration</CardTitle>
              <CardDescription>Changes will trigger a hard reload of the SDK.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-2">
                  <Label>OpenRouter Key</Label>
                  <Input 
                    type="password" 
                    value={localKeys.openrouter} 
                    onChange={e => setLocalKeys({...localKeys, openrouter: e.target.value})} 
                    placeholder="sk-or-..."
                  />
              </div>
              <div className="space-y-2">
                  <Label>Grok (xAI) Key</Label>
                  <Input 
                    type="password" 
                    value={localKeys.grok} 
                    onChange={e => setLocalKeys({...localKeys, grok: e.target.value})} 
                    placeholder="xai-..."
                  />
              </div>
              <div className="space-y-2">
                  <Label>Google Gemini Key</Label>
                  <Input 
                    type="password" 
                    value={localKeys.google} 
                    onChange={e => setLocalKeys({...localKeys, google: e.target.value})} 
                    placeholder="AIza..."
                  />
              </div>
              <Button onClick={handleSaveKeys} className="w-full">
                  <Save className="w-4 h-4 mr-2" /> Save & Reload SDK
              </Button>
          </CardContent>
      </Card>
    </div>
  );
}
