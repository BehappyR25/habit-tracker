"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AuthForm from "../components/AuthForm"; // Import the login form

export default function Home() {
  const [session, setSession] = useState<any>(null); // Track user session
  const [habits, setHabits] = useState<any[]>([]);
  const [newHabitName, setNewHabitName] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

    const { data, error } = await supabase
      .from("habits")
      .insert([{ 
        name: tempName, 
        user_id: session.user.id // INSERT: Attach my ID
      }])
      .select();

    if (error) console.log("Error adding:", error);
    else if (data) setHabits((prev) => [...prev, data[0]]);
  };

  const deleteHabit = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this habit?")) return;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    await supabase.from("habits").delete().eq("id", id);
  };

  const toggleHabit = async (habit: any) => {
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

    await supabase
      .from("habits")
      .update({ completed_dates: newDates })
      .eq("id", habit.id);
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
                  {wasCompleted ? (
                     <span className="text-emerald-400 flex items-center gap-2 text-sm font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">✓ Done</span>
                  ) : (
                     <span className="text-gray-500 text-sm font-medium px-3 py-1">Missed</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    );
  };

  const CalendarView = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const getDayData = (day: number) => {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const activeHabits = habits.filter(habit => {
        const createdDateLocal = getLocalDateString(new Date(habit.created_at));
        return createdDateLocal <= dateString;
      });
      let completedCount = 0;
      activeHabits.forEach(habit => {
        if (habit.completed_dates && habit.completed_dates.includes(dateString)) completedCount++;
      });
      
      if (activeHabits.length === 0) return { dateString, colorClass: "bg-white/5 text-gray-600 hover:bg-white/10" };

      const percentage = (completedCount / activeHabits.length) * 100;
      let colorClass = "";
      if (percentage === 0) colorClass = "bg-white/5 text-gray-500 hover:bg-white/10";
      else if (percentage < 50) colorClass = "bg-rose-500/20 text-rose-200 border border-rose-500/30 hover:bg-rose-500/30";
      else if (percentage < 100) colorClass = "bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30";
      else colorClass = "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:bg-emerald-500/30";

      return { dateString, colorClass };
    };

    return (
      <div className="w-full animate-in slide-in-from-left duration-200">
        <h2 className="text-lg font-bold mb-4 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          {date.toLocaleString('default', { month: 'long' })} Overview
        </h2>
        <div className="grid grid-cols-7 gap-1">
          {['S','M','T','W','T','F','S'].map((d, i) => (<div key={i} className="text-center text-[10px] text-gray-500 font-bold uppercase">{d}</div>))}
          {daysArray.map((day) => {
            const { dateString, colorClass } = getDayData(day);
            return (
              <button key={day} onClick={() => setSelectedDate(dateString)} className={`h-8 w-full rounded-md flex items-center justify-center text-xs font-bold transition-all duration-300 ${colorClass}`}>
                {day}
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-gray-500 mt-4">Click a day to view details</p>
      </div>
    );
  };

  // --- 2. RENDER: Login Screen OR App ---
  if (!session) {
    return <AuthForm />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24 relative overflow-hidden bg-[#0a0a0a]">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl flex justify-between items-center mb-12">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 drop-shadow-lg">
            Habit Tracker
          </h1>
          <p className="text-gray-400 mt-2 text-lg">Build consistency, one day at a time.</p>
        </div>
        
        <div className="flex gap-3">
           {/* LOGOUT BUTTON */}
           <button 
             onClick={handleLogout}
             className="p-4 bg-white/5 hover:bg-rose-500/20 rounded-2xl border border-white/10 transition-all hover:scale-105 group backdrop-blur-md"
             title="Sign Out"
           >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-rose-400">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
           </button>

           <button 
            onClick={() => { setShowCalendar(true); setSelectedDate(null); }}
            className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all hover:scale-105 group backdrop-blur-md"
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

      <div className="w-full max-w-2xl space-y-4">
        {habits.map((habit) => {
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
        {habits.length === 0 && <div className="text-center p-12 text-gray-500 border-2 border-dashed border-white/10 rounded-3xl"><p className="text-lg">No habits found.</p><p className="text-sm">Create one to get started!</p></div>}
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