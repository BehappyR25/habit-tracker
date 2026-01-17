"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [habits, setHabits] = useState<any[]>([]);
  const [newHabitName, setNewHabitName] = useState("");

  useEffect(() => {
    fetchHabits();
  }, []);

  const fetchHabits = async () => {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .order("id", { ascending: true });
    if (!error) setHabits(data || []);
  };

  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const tempName = newHabitName;
    setNewHabitName("");

    const { data, error } = await supabase
      .from("habits")
      .insert([{ name: tempName }])
      .select();

    if (error) console.log("Error adding:", error);
    else if (data) setHabits((prev) => [...prev, data[0]]);
  };

  const deleteHabit = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setHabits((prev) => prev.filter((h) => h.id !== id));
    await supabase.from("habits").delete().eq("id", id);
  };

  const toggleHabit = async (habit: any) => {
    const today = new Date().toISOString().split("T")[0];
    const completedDates = habit.completed_dates || [];
    const isCompleted = completedDates.includes(today);
    
    let newDates;
    if (isCompleted) {
      newDates = completedDates.filter((d: string) => d !== today);
    } else {
      newDates = [...completedDates, today];
    }

    setHabits((currentHabits) =>
      currentHabits.map((h) =>
        h.id === habit.id ? { ...h, completed_dates: newDates } : h
      )
    );

    await supabase
      .from("habits")
      .update({ completed_dates: newDates })
      .eq("id", habit.id);
  };

  // NEW: Logic to calculate streak
  const getStreak = (dates: string[]) => {
    if (!dates || dates.length === 0) return 0;

    const sortedDates = [...dates].sort().reverse(); // Newest dates first
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let streak = 0;
    // Check if the streak is active (done today OR yesterday)
    let currentDate = sortedDates.includes(today) ? today : yesterday;

    // If neither today nor yesterday is done, streak is broken (0)
    if (!sortedDates.includes(currentDate)) return 0;

    // Count backwards
    for (const date of sortedDates) {
      if (date === currentDate) {
        streak++;
        // Move to previous day
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        currentDate = prevDate.toISOString().split("T")[0];
      }
    }
    return streak;
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">My Habit Tracker</h1>

      <div className="w-full max-w-md flex gap-2 mb-8">
        <input
          type="text"
          placeholder="New habit name..."
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          className="flex-1 p-2 rounded bg-gray-800 border border-gray-600 text-white focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === "Enter" && addHabit()}
        />
        <button
          onClick={addHabit}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 font-bold"
        >
          Add
        </button>
      </div>

      <div className="w-full max-w-md space-y-4">
        {habits.map((habit) => {
          const today = new Date().toISOString().split("T")[0];
          const isCompleted = habit.completed_dates?.includes(today);
          const streak = getStreak(habit.completed_dates || []);

          return (
            <div
              key={habit.id}
              onClick={() => toggleHabit(habit)}
              className={`p-4 rounded border cursor-pointer transition-all flex justify-between items-center select-none group
                ${
                  isCompleted
                    ? "bg-green-800 border-green-600 text-green-100"
                    : "bg-gray-800 border-gray-700 hover:border-gray-500"
                }`}
            >
              <div className="flex flex-col">
                <span className="text-lg font-medium">{habit.name}</span>
                {/* NEW: Streak Display */}
                <span className="text-xs text-gray-300">🔥 {streak} day streak</span>
              </div>
              
              <div className="flex items-center gap-3">
                <span>{isCompleted ? "✅" : "⚪"}</span>
                <button
                  onClick={(e) => deleteHabit(habit.id, e)}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}