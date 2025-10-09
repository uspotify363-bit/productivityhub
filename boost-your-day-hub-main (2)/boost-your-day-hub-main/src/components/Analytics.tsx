import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  Zap, 
  Calendar,
  Download,
  RefreshCw,
  Brain,
  Award,
  BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Analytics = () => {
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [progressData, setProgressData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalFocusTime: 0,
    tasksCompleted: 0,
    efficiency: 0,
    streak: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Get weekly data
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      
      const weeklyStats = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const { data } = await supabase
          .from('user_stats')
          .select('focus_time')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .maybeSingle();
        
        weeklyStats.push({
          day: days[i],
          hours: data ? data.focus_time / 60 : 0
        });
      }
      setWeeklyData(weeklyStats);

      // Get task categories from recent tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('type')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (tasks) {
        const typeCounts = tasks.reduce((acc: any, task) => {
          acc[task.type] = (acc[task.type] || 0) + 1;
          return acc;
        }, {});

        const categoryColors: Record<string, string> = {
          work: '#8b5cf6',
          meeting: '#06b6d4',
          personal: '#10b981',
          learning: '#f59e0b'
        };

        const categories = Object.entries(typeCounts).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value: value as number,
          color: categoryColors[name] || '#64748b'
        }));
        setCategoryData(categories);
      }

      // Get monthly progress data
      const monthlyStats = [];
      const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let i = 0; i < 6; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        
        const { data: monthData } = await supabase
          .from('user_stats')
          .select('focus_time, efficiency_score')
          .eq('user_id', user.id)
          .gte('date', `${year}-${month.toString().padStart(2, '0')}-01`)
          .lt('date', `${year}-${(month + 1).toString().padStart(2, '0')}-01`);

        const totalFocus = monthData?.reduce((sum, day) => sum + day.focus_time, 0) || 0;
        const avgEfficiency = monthData?.length 
          ? monthData.reduce((sum, day) => sum + day.efficiency_score, 0) / monthData.length 
          : 0;

        monthlyStats.push({
          month: months[i],
          focus: Math.round(totalFocus / 60),
          efficiency: Math.round(avgEfficiency)
        });
      }
      setProgressData(monthlyStats);

      // Get overall stats
      const { data: allTimeStats } = await supabase
        .from('user_stats')
        .select('focus_time, tasks_completed, efficiency_score, date, pomodoro_sessions')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      const totalFocus = allTimeStats?.reduce((sum, day) => sum + day.focus_time, 0) || 0;
      const totalTasks = allTimeStats?.reduce((sum, day) => sum + day.tasks_completed, 0) || 0;
      const avgEfficiency = allTimeStats?.length 
        ? allTimeStats.reduce((sum, day) => sum + day.efficiency_score, 0) / allTimeStats.length 
        : 0;

      // Calculate streak
      let currentStreak = 0;
      if (allTimeStats && allTimeStats.length > 0) {
        const today = new Date();
        let checkDate = new Date(today);
        
        for (const stat of allTimeStats) {
          const statDate = new Date(stat.date);
          const daysDiff = Math.floor((checkDate.getTime() - statDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 0 || daysDiff === 1) {
            if (stat.pomodoro_sessions > 0 || stat.tasks_completed > 0) {
              currentStreak++;
              checkDate = statDate;
            } else {
              break;
            }
          } else {
            break;
          }
        }
      }

      setStats({
        totalFocusTime: Math.round(totalFocus / 60),
        tasksCompleted: totalTasks,
        efficiency: Math.round(avgEfficiency),
        streak: currentStreak
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load analytics data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <Badge className="bg-info/10 text-info border-info/20">
            Real-time Data
          </Badge>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex items-center gap-2" onClick={fetchAnalytics} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Updating...' : 'Refresh Data'}
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Focus Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFocusTime}h</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" />
              All time total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tasksCompleted}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" />
              All time total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Efficiency Score</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.efficiency}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" />
              Average score
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.streak} days</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" />
              Keep it up!
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Focus Time Chart */}
        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Weekly Focus Pattern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading chart data...</div>
                </div>
              ) : (
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time Distribution */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-secondary" />
              Task Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading chart data...</div>
                </div>
              ) : categoryData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">No task data available</div>
                </div>
              ) : (
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              )}
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {categoryData.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span>{item.name}</span>
                  </div>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trends */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            6-Month Progress Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading chart data...</div>
              </div>
            ) : (
              <LineChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="focus" 
                  stroke="#8b5cf6" 
                  strokeWidth={3}
                  name="Focus Hours"
                />
                <Line 
                  type="monotone" 
                  dataKey="efficiency" 
                  stroke="#06b6d4" 
                  strokeWidth={3}
                  name="Efficiency %"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            AI Insights & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border bg-success/5 border-success/20">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-foreground">Peak Performance</h4>
              <Badge variant="outline" className="text-success border-success/30">
                +12%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">You're most productive in the morning. Schedule important tasks between 9-11 AM.</p>
          </div>
          
          <div className="p-4 rounded-lg border bg-info/5 border-info/20">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-foreground">Focus Improvement</h4>
              <Badge variant="outline" className="text-info border-info/30">
                +15min
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Your average focus session increased by 15 minutes this month.</p>
          </div>
          
          <div className="p-4 rounded-lg border bg-warning/5 border-warning/20">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-foreground">Break Reminder</h4>
              <Badge variant="outline" className="text-warning border-warning/30">
                -8%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Consider taking more breaks - efficiency drops after 2h sessions.</p>
          </div>
          
          <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-foreground">Weekly Progress</h4>
              <Badge variant="outline" className="text-primary border-primary/30">
                85%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">You're 85% towards your weekly focus time goal. Keep it up!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;