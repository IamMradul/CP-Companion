import { useContestStore } from "../stores/useContestStore";
import { ContestCard } from "./ContestCard";
import { formatDateHeader } from "../utils/time";

export function WidgetView() {
  const { contests } = useContestStore();

  const groups: { header: string; contests: typeof contests }[] = [];
  
  contests.forEach((contest) => {
    const header = formatDateHeader(contest.startTime);
    let group = groups.find((g) => g.header === header);
    if (!group) {
      group = { header, contests: [] };
      groups.push(group);
    }
    group.contests.push(contest);
  });

  if (contests.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest px-1">
          Up Next
        </h2>
        <div className="text-sm text-white/50 px-1">No upcoming contests found.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ header, contests: groupContests }) => (
        <div key={header} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest px-1">
            {header}
          </h2>
          <div className="flex flex-col gap-3">
            {groupContests.map((contest) => (
              <ContestCard key={contest.id} contest={contest} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
