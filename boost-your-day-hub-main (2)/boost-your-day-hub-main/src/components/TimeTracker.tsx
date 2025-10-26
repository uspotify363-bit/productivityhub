import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

const WORK_DURATION = 25 * 60; // 25 minutes
const SHORT_BREAK = 5 * 60; // 5 minutes
const LONG_BREAK = 15 * 60; // 15 minutes

const TimeTracker = () => {
  const [task, setTask] = useState("");
  const [timeLeft, setTimeLeft] = useState(WORK_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [status, setStatus] = useState("Work");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (isRunning && timeLeft === 0) {
      handleTimerEnd();
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    cleanupOldSessions();
    fetchRecentSessions();
  }, []);

  const cleanupOldSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase
        .from("pomodoro_sessions")
        .delete()
        .lt("started_at", `${today}T00:00:00`)
        .eq("user_id", user.id);

      if (error) console.error("Error cleaning old sessions:", error);
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  };

  const fetchRecentSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("pomodoro_sessions")
      .select("task_name, started_at, completed, mode")
      .eq("user_id", user.id)
      .gte("started_at", `${today}T00:00:00`)
      .lte("started_at", `${today}T23:59:59`)
      .order("started_at", { ascending: false })
      .limit(5);

    if (!error && data) setRecentSessions(data);
  };

  const handleStart = async () => {
    if (!task.trim() && !isBreak) {
      toast({
        title: "Enter a task",
        description: "Please describe what you're working on before starting.",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("pomodoro_sessions")
      .insert({
        user_id: user.id,
        started_at: new Date().toISOString(),
        duration: isBreak
          ? cycleCount === 4
            ? LONG_BREAK
            : SHORT_BREAK
          : WORK_DURATION,
        completed: false,
        task_name: isBreak ? "Break" : task,
        mode: isBreak ? "break" : "work",
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      toast({ title: "Error starting session", description: error.message });
      return;
    }

    setCurrentSessionId(data.id);
    setIsRunning(true);
    toast({
      title: isBreak ? "Break started!" : "Pomodoro started!",
      description: isBreak ? "Relax for a few minutes ☕" : `Task: ${task}`,
    });
  };

  const handlePause = () => setIsRunning(false);

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(WORK_DURATION);
    setTask("");
    setIsBreak(false);
    setStatus("Work");
  };

  // ✅ Кнопка завершить сессию вручную
  const handleCompleteEarly = async () => {
    if (isRunning) setIsRunning(false);
    await handleTimerEnd(true);
  };

  const handleTimerEnd = async (manualComplete = false) => {
    setIsRunning(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (currentSessionId) {
      await supabase
        .from("pomodoro_sessions")
        .update({
          completed: true,
         completed_at: new Date().toISOString(), 
        })
        .eq("id", currentSessionId);
    }

    // ✅ если это рабочая сессия — добавляем время в user_stats
    if (!isBreak) {
     const actualDuration = manualComplete? WORK_DURATION - timeLeft: WORK_DURATION;
     const focusMinutes = Math.round(actualDuration / 60);

      const today = new Date().toISOString().split("T")[0];
      const { data: existingStats } = await supabase
        .from("user_stats")
        .select("id, focus_time, tasks_completed, pomodoro_sessions")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();

      if (existingStats) {
        await supabase
          .from("user_stats")
          .update({
            focus_time: existingStats.focus_time + focus_Minutes,
            pomodoro_sessions: existingStats.pomodoro_sessions + 1,
          })
          .eq("id", existingStats.id);
      } else {
        await supabase.from("user_stats").insert([
          {
            user_id: user.id,
            focus_time: focusMinutes,
            pomodoro_sessions 1,
            tasks_completed 0,
            efficiency_score: 100,
            date: today,
          },
        ]);
      }
    }

    if (isBreak) {
      setIsBreak(false);
      setStatus("Work");
      setTimeLeft(WORK_DURATION);
      toast({
        title: "Break is over!",
        description: "Back to work 💪",
      });
    } else {
      const nextCycle = cycleCount + 1;
      setCycleCount(nextCycle);
      if (nextCycle % 4 === 0) {
        setTimeLeft(LONG_BREAK);
        setStatus("Long Break");
      } else {
        setTimeLeft(SHORT_BREAK);
        setStatus("Short Break");
      }
      setIsBreak(true);
      toast({
        title: "Pomodoro complete!",
        description: "Take a short break ☕",
      });
    }

    setTask("");
    fetchRecentSessions();
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress =
    ((isBreak
      ? (status === "Long Break" ? LONG_BREAK : SHORT_BREAK)
      : WORK_DURATION - timeLeft) /
      (isBreak
        ? status === "Long Break"
          ? LONG_BREAK
          : SHORT_BREAK
        : WORK_DURATION)) *
    100;

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold">
            ⏱️ Pomodoro Time Tracker
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center text-lg font-semibold">
            {status === "Work"
              ? "Focus time 🔥"
              : status === "Short Break"
              ? "Short break ☕"
              : "Long break 🌴"}
          </div>

          {!isBreak && (
            <Input
              type="text"
              placeholder="Enter your task (e.g., 'Write essay', 'Study physics')"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={isRunning}
            />
          )}

          <div className="text-center text-5xl font-bold text-primary">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>

          <Progress value={progress} className="h-3" />

          <div className="flex justify-center gap-3">
            {!isRunning ? (
              <Button onClick={handleStart} className="w-24">
                Start
              </Button>
            ) : (
              <Button onClick={handlePause} variant="secondary" className="w-24">
                Pause
              </Button>
            )}
            <Button onClick={handleReset} variant="outline" className="w-24">
              Reset
            </Button>
            <Button
              onClick={handleCompleteEarly}
              variant="destructive"
              className="w-24"
            >
              Complete
            </Button>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold text-lg mb-2">🕓 Recent Sessions</h3>
            <ul className="text-sm space-y-1">
              {recentSessions.length > 0 ? (
                recentSessions.map((s, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {s.mode === "break"
                        ? "Break"
                        : s.task_name || "Untitled task"}
                    </span>
                    <span
                      className={s.completed ? "text-green-600" : "text-gray-400"}
                    >
                      {s.completed ? "✔ Done" : "⏳ In progress"}
                    </span>
                  </li>
                ))
              ) : (
                <p className="text-gray-500">No Pomodoro sessions yet</p>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeTracker;
