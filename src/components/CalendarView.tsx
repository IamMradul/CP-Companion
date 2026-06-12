import { useContestStore } from "../stores/useContestStore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export function CalendarView() {
  const { contests } = useContestStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];
  
  // Previous month overflow
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push({ day: daysInPrevMonth - firstDayOfMonth + i + 1, currentMonth: false });
  }
  
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true });
  }

  // Next month overflow to complete the grid (usually 42 cells = 6 weeks)
  const remainingCells = 42 - days.length;
  for (let i = 1; i <= remainingCells; i++) {
    days.push({ day: i, currentMonth: false });
  }

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "codeforces": return "bg-blue-500 text-white";
      case "leetcode": return "bg-orange-500 text-white";
      case "atcoder": return "bg-zinc-700 text-white";
      case "codechef": return "bg-yellow-600 text-white";
      default: return "bg-white/20 text-white";
    }
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  return (
    <div className="flex flex-col h-full overflow-hidden p-2">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-white/90">
          {monthNames[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1 hover:bg-white/10 rounded text-white/70">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextMonth} className="p-1 hover:bg-white/10 rounded text-white/70">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map(day => (
          <div key={day} className="text-center text-[9px] font-semibold text-white/40">{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1 border border-white/5 bg-white/5 rounded-lg overflow-hidden auto-rows-fr">
        {days.map((d, i) => {
          // Find contests for this day (assuming contests array has ISO dates)
          const cellDate = new Date(year, d.currentMonth ? month : (d.day > 15 ? month - 1 : month + 1), d.day);
          const dayContests = contests.filter(c => {
            const contestDate = new Date(c.startTime);
            return contestDate.getFullYear() === cellDate.getFullYear() &&
                   contestDate.getMonth() === cellDate.getMonth() &&
                   contestDate.getDate() === cellDate.getDate();
          });

          const isToday = new Date().toDateString() === cellDate.toDateString();

          return (
            <div key={i} className={`border-r border-b border-white/5 p-1 relative flex flex-col gap-0.5 overflow-hidden min-h-0 ${d.currentMonth ? 'bg-transparent' : 'bg-black/20'}`}>
              <div className={`text-[10px] text-center mb-0.5 shrink-0 ${isToday ? 'bg-blue-500 text-white rounded-full w-4 h-4 mx-auto flex items-center justify-center' : (d.currentMonth ? 'text-white/70' : 'text-white/20')}`}>
                {d.day}
              </div>
              <div className="flex flex-col gap-[1px] overflow-y-auto custom-scrollbar flex-1 min-h-0">
                {dayContests.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => window.open(c.url, '_blank')}
                    title={c.name}
                    className={`text-[8px] truncate px-1 py-0.5 rounded-sm cursor-pointer shrink-0 ${getPlatformColor(c.platform)}`}
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
