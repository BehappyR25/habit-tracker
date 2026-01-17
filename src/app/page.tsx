"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [habits, setHabits] = useState<any[]>([]);
  const [newHabitName, setNewHabitName] = useState("");

  // --- EXISTING LOGIC (Setup & CRUD) ---
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

  const getStreak = (dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    const sortedDates = [...dates].sort().reverse();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    let currentDate = sortedDates.includes(today) ? today : yesterday;
    if (!sortedDates.includes(currentDate)) return 0;
    
    let streak = 0;
    for (const date of sortedDates) {
      if (date === currentDate) {
        streak++;
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        currentDate = prevDate.toISOString().split("T")[0];
      }
    }
    return streak;
  };

  // --- NEW: CALENDAR LOGIC ---
  const CalendarView = () => {
    // 1. Get current month details
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0 = Jan, 1 = Feb...
    
    // Get number of days in this month (e.g., 30 or 31)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Generate array of days: [1, 2, 3, ... 31]
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // 2. Helper to get color for a specific day
    const getColorForDay = (day: number) => {
      if (habits.length === 0) return "bg-gray-800"; // No habits yet

      // Format date as "YYYY-MM-DD"
      // Note: We add 1 to month because JS months are 0-indexed
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Count how many habits were done on this date
      let completedCount = 0;
      habits.forEach(habit => {
        if (habit.completed_dates && habit.completed_dates.includes(dateString)) {
          completedCount++;
        }
      });

      // Calculate Percentage
      const percentage = (completedCount / habits.length) * 100;

      // Return Color based on percentage
      if (percentage === 0) return "bg-gray-800 border-gray-700 text-gray-500"; // 0%
      if (percentage < 50) return "bg-red-900 border-red-700 text-red-200";     // 1-49%
      if (percentage < 100) return "bg-yellow-700 border-yellow-600 text-yellow-100"; // 50-99%
      return "bg-green-600 border-green-500 text-green-100";                  // 100%
    };

    return (
      <div className="w-full max-w-md mt-10 p-6 bg-gray-800 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-center">
          {date.toLocaleString('default', { month: 'long' })} Progress
        </h2>
        
        {/* The Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day Headers (S M T W T F S) */}
          {['S','M','T','W','T','F','S'].map((d, i) => (
             <div key={i} className="text-center text-xs text-gray-400 font-bold">{d}</div>
          ))}

          {/* Render Days */}
          {daysArray.map((day) => (
            <div
              key={day}
              className={`h-10 w-full rounded border flex items-center justify-center text-sm font-medium transition-colors ${getColorForDay(day)}`}
              title={`Day ${day}`}
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="flex justify-between mt-4 text-xs text-gray-400">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-800 border border-gray-700"></div> 0%</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-900 border border-red-700"></div> Low</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-700 border border-yellow-600"></div> Mid</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-600 border border-green-500"></div> 100%</div>
        </div>
      </div>
    );
  };

  // --- RENDER ---
  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">My Habit Tracker</h1>

      {/* Input Form */}
      <div className="w-full max-w-md flex gap-2 mb-8">
        <input
          type="text"
          placeholder="New habit name..."
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          className="flex-1 p-2 rounded bg-gray-800 border border-gray-600 text-white focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === "Enter" && addHabit()}
        />
        <button onClick={addHabit} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 font-bold">Add</button>
      </div>

      {/* Habit List */}
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
                ${isCompleted ? "bg-green-800 border-green-600 text-green-100" : "bg-gray-800 border-gray-700 hover:border-gray-500"}`}
            >
              <div className="flex flex-col">
                <span className="text-lg font-medium">{habit.name}</span>
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

      {/* NEW: Render the Calendar here */}
      <CalendarView />
      
    </main>
  );
}