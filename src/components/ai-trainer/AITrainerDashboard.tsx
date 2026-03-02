import React from 'react';
import { useAITrainer } from './AITrainerContext';
import { Activity, Dumbbell, Quote, Droplets, Moon, Utensils, AlertTriangle, TrendingUp, TrendingDown, Target, Zap, Shield, Save, CheckCircle2, FlaskConical, HeartPulse, History, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const ProgressRing = ({ value, label, icon: Icon, color }: { value: number, label: string, icon: any, color: string }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center p-4 bg-muted/30 rounded-2xl border border-muted-foreground/10">
      <div className="relative w-24 h-24 mb-3">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/20" />
          <motion.circle
            cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent"
            strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }} transition={{ duration: 1.5, ease: "easeOut" }}
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className={`w-8 h-8 ${color.replace('stroke-', 'text-')}`} />
        </div>
      </div>
      <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-center">{label}</p>
      <p className="text-xl font-black">{value}%</p>
    </div>
  );
};

const RoutineView = ({ routine }: { routine?: any }) => {
    if (!routine) return (
        <div className="text-center py-8 text-muted-foreground">
            <Dumbbell className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No protocol active for this timeframe.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            <p className="text-xs italic text-muted-foreground">Rationale: {routine.rationale}</p>
            <div className="space-y-2">
                {routine.exercises.map((ex: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg border border-muted">
                        <div>
                            <p className="text-sm font-bold">{ex.name}</p>
                            {ex.notes && <p className="text-[10px] text-muted-foreground">{ex.notes}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-primary">{ex.sets} <span className="text-muted-foreground font-normal text-xs">sets</span> x {ex.reps}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const AITrainerDashboard = () => {
  const { profile, healthLogs, predictedPerformance, dailyQuote, isGuest, routines, isProfileComplete } = useAITrainer();
  const navigate = useNavigate();

  if (!profile) return null;

  const latestLog = healthLogs[healthLogs.length - 1] || {};
  const prevLog = healthLogs[healthLogs.length - 2];
  const thisWeekLogs = healthLogs.slice(-7);
  const consistency = thisWeekLogs.length;

  const dailyRoutine = routines.find(r => r.timeframe === 'daily' && r.status === 'active');
  const weeklyRoutine = routines.find(r => r.timeframe === 'weekly' && r.status === 'active');

  return (
    <div className="space-y-6 pb-20">
      {!isProfileComplete && (
        <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-4 flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-bold text-primary">Finish Onboarding</p>
                    <p className="text-xs text-muted-foreground">Your profile is prefilled. Complete onboarding to unlock full analytics.</p>
                </div>
                <Button size="sm" onClick={() => navigate('/ai-trainer?onboarding=1')}>
                    Finish Onboarding
                </Button>
            </CardContent>
        </Card>
      )}

      {/* Guest Mode Banner */}
      {isGuest && (
        <Card className="bg-orange-500/10 border-orange-500/30">
            <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <div>
                        <p className="text-sm font-bold text-orange-500">Unregistered Neural Link</p>
                        <p className="text-xs text-muted-foreground">Your data is stored locally. Sign in to permanently encrypt and save your vault.</p>
                    </div>
                </div>
                <Button size="sm" variant="outline" className="border-orange-500/50 hover:bg-orange-500/20" onClick={() => navigate('/vault?returnTo=/ai-trainer')}>
                    <Save className="w-4 h-4 mr-2" /> Save Vault
                </Button>
            </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Capacity Card */}
        <Card className="lg:col-span-2 relative overflow-hidden bg-gradient-to-br from-primary/30 via-primary/5 to-transparent border-primary/20 shadow-2xl shadow-primary/10">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Zap className="w-48 h-48 text-primary" /></div>
          <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="relative w-40 h-40 flex items-center justify-center">
               <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse"></div>
               <div className="absolute inset-2 rounded-full border-2 border-primary/40"></div>
               <div className="text-center">
                  <span className="text-5xl font-black tracking-tighter text-primary">{predictedPerformance || '85'}</span>
                  <span className="text-xl font-bold text-primary">%</span>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Capacity</p>
               </div>
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div>
                <h3 className="text-2xl font-bold flex items-center justify-center md:justify-start gap-2">
                   <Shield className="w-6 h-6 text-primary" /> Titan Engine Status
                </h3>
                <p className="text-muted-foreground mt-2 leading-relaxed">
                   Operating at {predictedPerformance || 85}% efficiency.
                   {latestLog?.cnsFatigueScore && latestLog.cnsFatigueScore > 7 ? " Warning: CNS overload detected. Adapting protocols." : " Neural pathways clear. Protocols optimized for performance."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                 <span className="px-3 py-1 bg-primary/10 rounded-full text-[10px] font-bold uppercase text-primary border border-primary/20">Titan Core Active</span>
                 <span className="px-3 py-1 bg-green-500/10 rounded-full text-[10px] font-bold uppercase text-green-500 border border-green-500/20">Identity Synced</span>
                 {profile.trackingLevel === 'indepth' && <span className="px-3 py-1 bg-purple-500/10 rounded-full text-[10px] font-bold uppercase text-purple-500 border border-purple-500/20">Biological Tracking</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Motivation */}
        <Card className="relative overflow-hidden group">
          <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors"></div>
          <CardContent className="p-8 h-full flex flex-col justify-between relative z-10">
            <Quote className="w-10 h-10 text-primary/20 mb-4" />
            <p className="text-xl italic font-serif leading-relaxed text-foreground/90">
              "{dailyQuote || "Your potential is a limited resource until you apply discipline. Let's optimize."}"
            </p>
            <div className="mt-8 flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground">{profile.name[0]}</div>
               <div>
                  <p className="text-sm font-bold">{profile.name}</p>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-widest">Titan Engine Strategist</p>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Protocol & History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Training Protocols */}
          <Card className="bg-card border-primary/20 shadow-md">
              <CardHeader className="pb-4 border-b">
                  <CardTitle className="flex items-center gap-2 text-lg">
                      <Dumbbell className="w-5 h-5 text-primary" /> Training Protocols
                  </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                  <Tabs defaultValue="daily" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                          <TabsTrigger value="daily">Daily Session</TabsTrigger>
                          <TabsTrigger value="weekly">Weekly Strategy</TabsTrigger>
                      </TabsList>
                      <TabsContent value="daily">
                          <RoutineView routine={dailyRoutine} />
                      </TabsContent>
                      <TabsContent value="weekly">
                          <RoutineView routine={weeklyRoutine} />
                      </TabsContent>
                  </Tabs>
              </CardContent>
          </Card>

          {/* Physical Soul & Identity */}
          <div className="space-y-6">
              {/* Soul Insights History */}
              <Card className="bg-muted/10 border-none">
                  <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <History className="w-4 h-4 text-primary" /> Physical Soul History
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                      {!profile.soul?.insights || profile.soul.insights.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic text-center py-4">No physical landmarks recorded yet.</p>
                      ) : (
                          <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-primary/20">
                              {profile.soul.insights.map((insight, i) => (
                                  <div key={i} className="p-2 bg-background/50 border rounded text-[11px] flex gap-2">
                                      <span className="text-primary font-bold whitespace-nowrap">{insight.date}</span>
                                      <span className="text-muted-foreground uppercase font-bold text-[9px] px-1 bg-muted rounded h-fit">{insight.type}</span>
                                      <p className="text-foreground">{insight.content}</p>
                                  </div>
                              ))}
                          </div>
                      )}
                  </CardContent>
              </Card>

              {/* Identity & Biological Context */}
              <Card className="bg-muted/10 border-none">
                  <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <User className="w-4 h-4 text-purple-500" /> Identity Matrix
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-background border rounded-lg">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground">Identity</p>
                          <p className="text-sm font-bold truncate">{profile.soul?.identity?.genderIdentity || profile.gender}</p>
                      </div>
                      <div className="p-3 bg-background border rounded-lg">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground">Strategy</p>
                          <p className="text-sm font-bold capitalize">{profile.soul?.identity?.preferredCoachingStyle || 'Clinical'}</p>
                      </div>
                      {profile.trackingLevel === 'indepth' && (
                          <div className="p-3 bg-background border rounded-lg col-span-2 flex justify-between items-center">
                              <div>
                                  <p className="text-[9px] uppercase font-bold text-muted-foreground">Physiological Context</p>
                                  <p className="text-xs">{profile.assignedAtBirth ? `Assigned at birth: ${profile.assignedAtBirth}` : 'Pending synchronization...'}</p>
                              </div>
                              <Shield className="w-4 h-4 text-primary/40" />
                          </div>
                      )}
                  </CardContent>
              </Card>

              {/* Biometrics INDEPTH */}
              {profile.trackingLevel === 'indepth' && latestLog.menstrualCycleDay && (
                  <Card className="bg-pink-500/5 border border-pink-500/10">
                      <CardContent className="p-4 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                              <HeartPulse className="w-6 h-6 text-pink-500" />
                              <div>
                                  <p className="text-[10px] uppercase font-bold text-pink-500/70">Bio-Periodization</p>
                                  <p className="text-sm font-black">Day {latestLog.menstrualCycleDay} - {latestLog.menstrualPhase}</p>
                              </div>
                          </div>
                          <Zap className="w-5 h-5 text-pink-500 animate-pulse" />
                      </CardContent>
                  </Card>
              )}
          </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ProgressRing value={latestLog?.dietQuality ? latestLog.dietQuality * 10 : 0} label="Diet Load" icon={Utensils} color="stroke-green-500" />
          <ProgressRing value={latestLog?.sleepHours ? Math.min(100, (latestLog.sleepHours / 8) * 100) : 0} label="Neural Recovery" icon={Moon} color="stroke-blue-500" />
          <ProgressRing value={latestLog?.trainingIntensity ? latestLog.trainingIntensity * 10 : 0} label="Output Power" icon={Zap} color="stroke-orange-500" />
          <ProgressRing value={(consistency / 7) * 100} label="Consistency" icon={Target} color="stroke-primary" />
      </div>
    </div>
  );
};
