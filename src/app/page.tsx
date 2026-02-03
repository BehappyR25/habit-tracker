"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AuthForm from "../components/AuthForm"; // Import the login form

export default function Home() {
  const [session, setSession] = useState<any>(null); // Track user session
  const [habits, setHabits] = useState<any[]>([]);
  const [newHabitName, setNewHabitName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "completed" | "pending">("all");
  const [sortMode, setSortMode] = useState<"recent" | "streak" | "name">("recent");

  // --- 1. CHECK AUTH STATUS ---
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchHabits(session.user.id);
    });

    // Listen for changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchHabits(session.user.id);
      else setHabits([]); // Clear habits on logout
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- HELPER: Get Local Date ---
  const getLocalDateString = (dateObj = new Date()) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getRecentDates = (days: number) => {
    return Array.from({ length: days }, (_, index) => {
      const dateObj = new Date();
      dateObj.setDate(dateObj.getDate() - index);
      return getLocalDateString(dateObj);
    });
  };

  // --- CRUD OPERATIONS (Now User Specific) ---
  const fetchHabits = async (userId: string) => {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId) // FILTER: Only show my habits
      .order("id", { ascending: true });
    if (!error) setHabits(data || []);
  };

  const addHabit = async () => {
    if (!newHabitName.trim() || !session) return;
    const tempName = newHabitName;
    setNewHabitName("");
    setStatusMessage("");

    const { data, error } = await supabase
      .from("habits")
      .insert([{ 
        name: tempName, 
        user_id: session.user.id // INSERT: Attach my ID
      }])
      .select();

    if (error) {
      setStatusMessage("We couldn't add that habit. Please try again.");
      setNewHabitName(tempName);
      return;
    }
    if (data) setHabits((prev) => [...prev, data[0]]);
  };

  const deleteHabit = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this habit?")) return;
    setStatusMessage("");
    const previousHabits = habits;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    const { error } = await supabase.from("habits").delete().eq("id", id);
    if (error) {
      setHabits(previousHabits);
      setStatusMessage("We couldn't delete that habit. Please try again.");
    }
  };

  const toggleHabit = async (habit: any) => {
    setStatusMessage("");
    const today = getLocalDateString(); 
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

    const { error } = await supabase
      .from("habits")
      .update({ completed_dates: newDates })
      .eq("id", habit.id);
    if (error) {
      setHabits((currentHabits) =>
        currentHabits.map((h) =>
          h.id === habit.id ? { ...h, completed_dates: completedDates } : h
        )
      );
      setStatusMessage("We couldn't update that habit. Please try again.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- STREAK & CALENDAR LOGIC (Same as before) ---
  const getStreak = (dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    const sortedDates = [...dates].sort().reverse();
    const today = getLocalDateString(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateString(yesterdayDate);

    let currentDate = sortedDates.includes(today) ? today : yesterday;
    if (!sortedDates.includes(currentDate)) return 0;
    
    let streak = 0;
    for (const date of sortedDates) {
      if (date === currentDate) {
        streak++;
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        currentDate = getLocalDateString(prevDate);
      }
    }
    return streak;
  };

  const today = getLocalDateString();
  const totalHabits = habits.length;
  const completedToday = habits.filter(h => h.completed_dates?.includes(today)).length;
  const progressPercentage = totalHabits === 0 ? 0 : Math.round((completedToday / totalHabits) * 100);
  const longestStreak = habits.reduce((max, habit) => Math.max(max, getStreak(habit.completed_dates || [])), 0);
  const activeStreaks = habits.filter(habit => getStreak(habit.completed_dates || []) > 0).length;
  const recentDates = getRecentDates(7);
  const weeklyCompletions = habits.reduce((count, habit) => {
    const completedDates = habit.completed_dates || [];
    return count + recentDates.filter(date => completedDates.includes(date)).length;
  }, 0);
  const weeklyPossible = totalHabits * 7;
  const weeklyRate = weeklyPossible === 0 ? 0 : Math.round((weeklyCompletions / weeklyPossible) * 100);

  const filteredHabits = habits
    .filter((habit) => habit.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((habit) => {
      if (filterMode === "completed") return habit.completed_dates?.includes(today);
      if (filterMode === "pending") return !habit.completed_dates?.includes(today);
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "streak") {
        const streakA = getStreak(a.completed_dates || []);
        const streakB = getStreak(b.completed_dates || []);
        return streakB - streakA;
      }
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

  const DateDetailView = () => {
    if (!selectedDate) return null;
    const dateObj = new Date(selectedDate);
    const niceDate = dateObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
    const activeHabitsOnDate = habits.filter(habit => {
      const createdDateLocal = getLocalDateString(new Date(habit.created_at));
      return createdDateLocal <= selectedDate;
    });

    return (
      <div className="w-full animate-in slide-in-from-right duration-200">
        <div className="flex items-center mb-6">
          <button onClick={() => setSelectedDate(null)} className="p-2 mr-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">←</button>
          <h2 className="text-xl font-bold text-white">{niceDate}</h2>
        </div>
        <div className="space-y-3">
          {activeHabitsOnDate.length === 0 ? (
             <p className="text-gray-500 text-center italic mt-4">No habits existed on this day.</p>
          ) : (
            activeHabitsOnDate.map(habit => {
              const wasCompleted = habit.completed_dates?.includes(selectedDate);
              return (
                <div key={habit.id} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-gray-200">{habit.name}</span>
@@ -258,72 +318,137 @@ export default function Home() {
            title="View Calendar"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 group-hover:text-white transition-colors">
               <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
               <line x1="16" y1="2" x2="16" y2="6"></line>
               <line x1="8" y1="2" x2="8" y2="6"></line>
               <line x1="3" y1="10" x2="21" y2="10"></line>
             </svg>
           </button>
        </div>
      </div>

      <div className="w-full max-w-2xl mb-12 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md shadow-xl">
        <div className="flex justify-between items-end mb-2">
          <span className="text-gray-400 font-medium">Daily Progress</span>
          <span className="text-3xl font-bold text-white">{progressPercentage}%</span>
        </div>
        <div className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${progressPercentage}%` }} />
        </div>
        <p className="text-center mt-4 text-sm text-gray-500 font-medium">
          {progressPercentage === 100 ? "🎉 All goals crushed! Amazing work!" : `${completedToday} of ${totalHabits} completed`}
        </p>
      </div>

      <div className="w-full max-w-2xl grid gap-4 md:grid-cols-3 mb-10">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-md shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Longest Streak</p>
          <p className="text-3xl font-bold text-white mt-2">{longestStreak} days</p>
          <p className="text-sm text-gray-400 mt-1">Your all-time best streak.</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-md shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Active Habits</p>
          <p className="text-3xl font-bold text-white mt-2">{activeStreaks}</p>
          <p className="text-sm text-gray-400 mt-1">Habits with an ongoing streak.</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-md shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">This Week</p>
          <p className="text-3xl font-bold text-white mt-2">{weeklyRate}%</p>
          <p className="text-sm text-gray-400 mt-1">{weeklyCompletions} of {weeklyPossible} check-ins.</p>
        </div>
      </div>

      <div className="w-full max-w-2xl flex gap-3 mb-10 relative">
        <input
          type="text"
          placeholder="What's your new goal?"
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          className="flex-1 p-5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all text-lg shadow-inner"
          onKeyDown={(e) => e.key === "Enter" && addHabit()}
        />
        <button onClick={addHabit} className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white shadow-lg hover:shadow-purple-500/30 hover:scale-105 transition-all duration-200">Add</button>
      </div>

      {statusMessage && (
        <div className="w-full max-w-2xl mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {statusMessage}
        </div>
      )}

      <div className="w-full max-w-2xl flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="Search habits..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as "recent" | "streak" | "name")}
            className="p-4 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="recent">Sort: Newest</option>
            <option value="streak">Sort: Streak</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
        <div className="flex gap-2">
          {(["all", "completed", "pending"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                filterMode === mode
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-transparent border-white/10 text-gray-400 hover:text-white hover:border-white/30"
              }`}
            >
              {mode === "all" ? "All" : mode === "completed" ? "Completed today" : "Pending today"}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-2xl space-y-4">
        {filteredHabits.map((habit) => {
          const isCompleted = habit.completed_dates?.includes(today);
          const streak = getStreak(habit.completed_dates || []);
          return (
            <div key={habit.id} onClick={() => toggleHabit(habit)} className={`group relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex justify-between items-center backdrop-blur-sm ${isCompleted ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]"}`}>
              <div className="flex flex-col gap-1">
                <span className={`text-xl font-semibold transition-colors ${isCompleted ? "text-emerald-100" : "text-gray-200"}`}>{habit.name}</span>
                <span className={`text-xs font-bold tracking-wide flex items-center gap-1 ${isCompleted ? "text-emerald-400" : "text-gray-500"}`}><span className={streak > 0 ? "text-orange-500 animate-pulse" : ""}>🔥</span> {streak} DAY STREAK</span>
              </div>
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted ? "bg-emerald-500 border-emerald-500 scale-110" : "border-gray-600 group-hover:border-gray-400"}`}>{isCompleted && <span className="text-white text-sm font-bold">✓</span>}</div>
                <button onClick={(e) => deleteHabit(habit.id, e)} className="p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0" title="Delete Habit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          );
        })}
        {filteredHabits.length === 0 && (
          <div className="text-center p-12 text-gray-500 border-2 border-dashed border-white/10 rounded-3xl">
            <p className="text-lg">No habits match this view.</p>
            <p className="text-sm">Try adjusting filters or adding a new habit.</p>
          </div>
        )}
      </div>

      {showCalendar && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowCalendar(false)}>
          <div className="bg-[#121212] p-5 rounded-3xl border border-white/10 w-full max-w-sm relative shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowCalendar(false)} className="absolute top-4 right-4 p-1 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all z-10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            {selectedDate ? <DateDetailView /> : <CalendarView />}
          </div>
        </div>
      )}
    </main>
  );
}
