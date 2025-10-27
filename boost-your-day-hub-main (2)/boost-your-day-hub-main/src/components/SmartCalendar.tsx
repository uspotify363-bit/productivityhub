import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { updateDailyEfficiency } from "@/lib/efficiency";

interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  start_time: string;
  end_time: string;
  completed: boolean;
}

const SmartCalendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'day'>('week');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    type: 'work',
    date: '',
    startTime: '',
    endTime: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Week starts on Monday
      const monday = new Date(currentDate);
      monday.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(monday);
      endOfWeek.setDate(monday.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', monday.toISOString())
        .lte('start_time', endOfWeek.toISOString())
        .order('start_time', { ascending: true });

      if (error) {
        console.error('fetchTasks supabase error:', error);
        toast({ title: 'Error', description: 'Failed to load tasks: ' + (error.message || JSON.stringify(error)), variant: 'destructive' });
        return;
      }
      setTasks(data || []);
    } catch (err) {
      console.error('fetchTasks unexpected error:', err);
      toast({ title: 'Error', description: 'Unexpected error loading tasks', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const createTask = async () => {
    // basic validation
    if (!newTask.title || !newTask.date || !newTask.startTime || !newTask.endTime) {
      toast({ title: 'Error', description: 'Fill in all required fields', variant: 'destructive' });
      return;
    }

    // build Date objects
    const startDateTime = new Date(`${newTask.date}T${newTask.startTime}`);
    const endDateTime = new Date(`${newTask.date}T${newTask.endTime}`);
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      toast({ title: 'Error', description: 'Invalid date/time', variant: 'destructive' });
      return;
    }
    if (endDateTime <= startDateTime) {
      toast({ title: 'Error', description: 'End time must be after start time', variant: 'destructive' });
      return;
    }

    try {
      // get current user
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        console.error('auth.getUser error:', userErr);
        toast({ title: 'Auth error', description: 'Could not get user info', variant: 'destructive' });
        return;
      }
      const userId = (userData as any)?.user?.id;
      if (!userId) {
        toast({ title: 'Not authenticated', description: 'Please sign in to create tasks', variant: 'destructive' });
        return;
      }

      const payload = {
        user_id: userId,
        title: newTask.title,
        description: newTask.description,
        type: newTask.type,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString()
      };

      // Insert and return the inserted row
      const { data: inserted, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('createTask supabase insert error:', error);
        // show detailed message if available
        const detail = (error as any).message || JSON.stringify(error);
        toast({ title: 'Create failed', description: detail, variant: 'destructive' });
        return;
      }

      // success: add to local state so UI updates immediately
      if (inserted) {
        setTasks(prev => {
          // keep sorted by start_time ascending
          const next = [...prev, inserted];
          next.sort((a,b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
          return next;
        });
      }

      toast({ title: 'Success', description: 'Task created' });
      setIsDialogOpen(false);
      setNewTask({ title: '', description: '', type: 'work', date: '', startTime: '', endTime: '' });

      // optional: refetch to be 100% in sync
      fetchTasks();
    } catch (err) {
      console.error('createTask unexpected error:', err);
      toast({ title: 'Error', description: 'Unexpected error when creating task', variant: 'destructive' });
    }
  };

  const toggleTaskCompletion = async (taskId: string, completed: boolean) => {
    try {
      const { error } = await supabase.from('tasks').update({ completed: !completed }).eq('id', taskId);
      if (error) {
        console.error('toggleTaskCompletion error:', error);
        toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' });
        return;
      }
      
      // Update user_stats when task is completed
      if (!completed) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const today = new Date().toISOString().split('T')[0];
          const { data: existingStats } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .maybeSingle();

          if (existingStats) {
            await supabase
              .from('user_stats')
              .update({
                tasks_completed: (existingStats.tasks_completed || 0) + 1
              })
              .eq('id', existingStats.id);
          } else {
            await supabase
              .from('user_stats')
              .insert({
                user_id: user.id,
                date: today,
                tasks_completed: 1
              });
          }
        }
      }
      
      // Optimistically update local state
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed } : t));
      toast({ title: 'Success', description: completed ? 'Task marked as incomplete' : 'Task completed!' });
    } catch (err) {
      console.error('toggleTaskCompletion unexpected:', err);
      toast({ title: 'Error', description: 'Unexpected error updating task', variant: 'destructive' });
    }
  };

  // helper: open dialog prefilled (works for week/day)
  const handleCellClick = (dayIndex: number, hour: number) => {
    // determine date clicked
    let clickedDate = new Date(currentDate);
    if (view === 'week') {
      const monday = new Date(currentDate);
      monday.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      clickedDate = new Date(monday);
      clickedDate.setDate(monday.getDate() + dayIndex);
    } else {
      // day view: dayIndex is ignored; use currentDate
      clickedDate = new Date(currentDate);
    }

    const isoDate = clickedDate.toISOString().slice(0,10); // YYYY-MM-DD
    setNewTask(prev => ({
      ...prev,
      date: isoDate,
      startTime: `${String(hour).padStart(2,'0')}:00`,
      endTime: `${String(hour+1).padStart(2,'0')}:00`
    }));
    setIsDialogOpen(true);
  };

  // UI constants
  const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const hours = Array.from({length:20}, (_,i) => i + 4); // 4..23

  // filtered tasks for rendering (day vs week)
  const filteredTasks = view === 'day'
    ? tasks.filter(t => new Date(t.start_time).toDateString() === currentDate.toDateString())
    : tasks;

  const getEventColor = (type: string) => {
    switch(type){
      case 'meeting': return 'bg-blue-500/20 border-blue-500 text-blue-700';
      case 'work': return 'bg-green-500/20 border-green-500 text-green-700';
      case 'personal': return 'bg-purple-500/20 border-purple-500 text-purple-700';
      default: return 'bg-gray-500/20 border-gray-500 text-gray-700';
    }
  };

  // safe arrow handlers (avoid mutating currentDate)
  const prevDay = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  const nextDay = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Smart Calendar</h2>
          <Badge className="bg-primary/10 text-primary border-primary/20">Live Data</Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button variant={view === 'day' ? 'default' : 'ghost'} size="sm" onClick={() => setView('day')}>Day</Button>
            <Button variant={view === 'week' ? 'default' : 'ghost'} size="sm" onClick={() => setView('week')}>Week</Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevDay}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="font-medium min-w-[120px] text-center">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: view === 'day' ? 'numeric' : undefined })}
            </span>
            <Button variant="outline" size="sm" onClick={nextDay}><ChevronRight className="w-4 h-4" /></Button>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2"><Plus className="w-4 h-4" />Add Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
                </div>

                <div>
                  <Label htmlFor="type">Type</Label>
                  <Select value={newTask.type} onValueChange={v => setNewTask({...newTask, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={newTask.date} onChange={e => setNewTask({...newTask, date: e.target.value})} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="startTime">Start</Label>
                    <Input id="startTime" type="time" value={newTask.startTime} onChange={e => setNewTask({...newTask, startTime: e.target.value})} />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End</Label>
                    <Input id="endTime" type="time" value={newTask.endTime} onChange={e => setNewTask({...newTask, endTime: e.target.value})} />
                  </div>
                </div>

                <Button onClick={createTask} className="w-full">Create Task</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* day title */}
      {view === 'day' && (
        <div className="p-4 text-lg font-semibold text-center border-b">
          {currentDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* calendar grid */}
        <Card className="lg:col-span-3 border-0 shadow-lg">
          <CardContent className="p-0">
            {/* header row */}
            <div className={`grid ${view === 'week' ? 'grid-cols-8' : 'grid-cols-2'} border-b border-border/50`}>
              <div className="p-4 text-sm font-medium text-muted-foreground">Time</div>
              {view === 'week' ? weekDays.map((day, idx) => {
                const monday = new Date(currentDate);
                monday.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
                const dayDate = new Date(monday);
                dayDate.setDate(monday.getDate() + idx);
                return <div key={day} className="p-4 text-center"><div className="text-sm font-medium">{day}</div><div className="text-xs text-muted-foreground">{dayDate.getDate()}</div></div>;
              }) : (
                <div className="p-4 text-center">
                  <div className="text-sm font-medium">{currentDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                  <div className="text-xs text-muted-foreground">{currentDate.getDate()}</div>
                </div>
              )}
            </div>

            {/* hours */}
            <div className="max-h-[600px] overflow-y-auto">
              {hours.map(hour => (
                <div key={hour} className={`grid ${view === 'week' ? 'grid-cols-8' : 'grid-cols-2'} border-b border-border/20 min-h-[60px]`}>
                  <div className="p-4 text-sm text-muted-foreground border-r border-border/20">{hour}:00</div>
                  {(view === 'week' ? weekDays : ['day']).map((_, dayIndex) => (
                    <div key={`${dayIndex}-${hour}`} className="border-r border-border/20 p-2 relative cursor-pointer hover:bg-muted/20" onClick={() => handleCellClick(dayIndex, hour)}>
                      {filteredTasks.filter(task => {
                        const s = new Date(task.start_time);
                        const taskHour = s.getHours();
                        if (view === 'week') {
                          const taskDay = (s.getDay() + 6) % 7;
                          return taskHour === hour && taskDay === dayIndex;
                        } else {
                          return taskHour === hour && s.toDateString() === currentDate.toDateString();
                        }
                      }).map(task => (
                        <div key={task.id} className={`text-xs p-2 rounded border-l-2 cursor-pointer ${getEventColor(task.type)}`} onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id, task.completed); }}>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs opacity-80">{new Date(task.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - {new Date(task.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                          {task.completed && <div className="text-xs text-green-600">✓ Done</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* sidebar (always shown) */}
        <div className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {view === 'day' 
                  ? `Tasks for ${currentDate.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}` 
                  : `Tasks for ${currentDate.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <div className="text-center text-muted-foreground">Loading tasks...</div> : (
                tasks
                  .filter(task => {
                    const taskDate = new Date(task.start_time);
                    return taskDate.toDateString() === currentDate.toDateString();
                  })
                  .map(task => (
                    <div key={task.id} className={`p-2 rounded-lg border-l-4 cursor-pointer hover:shadow-md ${getEventColor(task.type)}`} onClick={() => toggleTaskCompletion(task.id, task.completed)}>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{task.title}</h4>
                        <Badge variant={task.completed ? 'default' : 'outline'}>{task.completed ? 'Done' : 'Pending'}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(task.start_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - {new Date(task.end_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
                      {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                    </div>
                  ))
              )}
              {!isLoading && tasks.filter(task => {
                const s = new Date(task.start_time);
                const dateStr = s.toDateString();
                return view === 'day' ? dateStr === currentDate.toDateString() : dateStr === new Date().toDateString();
              }).length === 0 && <div className="text-center text-muted-foreground">No tasks for this day</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SmartCalendar;
