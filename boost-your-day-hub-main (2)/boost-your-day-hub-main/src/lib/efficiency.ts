/**
 * Calculate efficiency score based on productivity metrics
 * 
 * Efficiency is calculated based on:
 * - Task completion rate (planned tasks vs completed)
 * - Pomodoro completion rate
 * - Focus time consistency
 * 
 * Returns a score from 0-100
 */

interface EfficiencyParams {
  tasksPlanned?: number;
  tasksCompleted: number;
  pomodorosSessions: number;
  focusTime: number; // in minutes
}

export const calculateEfficiency = ({
  tasksPlanned = 0,
  tasksCompleted,
  pomodorosSessions,
  focusTime
}: EfficiencyParams): number => {
  let efficiency = 0;
  let components = 0;

  // Component 1: Task completion rate (40% weight)
  if (tasksPlanned > 0) {
    const taskRate = Math.min(100, (tasksCompleted / tasksPlanned) * 100);
    efficiency += taskRate * 0.4;
    components++;
  } else if (tasksCompleted > 0) {
    // If no planned tasks, give credit for completed tasks
    efficiency += Math.min(40, tasksCompleted * 10);
    components++;
  }

  // Component 2: Pomodoro consistency (30% weight)
  // Ideal: 8-12 pomodoros per day
  const idealPomodoros = 10;
  if (pomodorosSessions > 0) {
    const pomodoroScore = Math.max(0, 100 - Math.abs(pomodorosSessions - idealPomodoros) * 10);
    efficiency += pomodoroScore * 0.3;
    components++;
  }

  // Component 3: Focus time quality (30% weight)
  // Ideal: 4-6 hours of focused work per day
  const idealFocusHours = 5;
  const actualFocusHours = focusTime / 60;
  if (focusTime > 0) {
    const focusScore = Math.max(0, 100 - Math.abs(actualFocusHours - idealFocusHours) * 20);
    efficiency += focusScore * 0.3;
    components++;
  }

  // If no components, return 0
  if (components === 0) return 0;

  // Return final score (0-100)
  return Math.round(Math.min(100, Math.max(0, efficiency)));
};

/**
 * Update efficiency score for today's stats
 */
export const updateDailyEfficiency = async (
  supabase: any,
  userId: string,
  additionalTasks: number = 0
): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's stats
  const { data: stats } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!stats) return;

  // Get today's planned tasks from calendar
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('completed')
    .eq('user_id', userId)
    .gte('start_time', `${today}T00:00:00`)
    .lte('start_time', `${today}T23:59:59`);

  const tasksPlanned = allTasks?.length || 0;
  const tasksCompleted = (stats.tasks_completed || 0) + additionalTasks;

  const efficiency = calculateEfficiency({
    tasksPlanned,
    tasksCompleted,
    pomodorosSessions: stats.pomodoro_sessions || 0,
    focusTime: stats.focus_time || 0
  });

  // Update the efficiency score
  await supabase
    .from('user_stats')
    .update({ efficiency_score: efficiency })
    .eq('id', stats.id);
};
