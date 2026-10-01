// Supported payroll path: Mon–Fri only, optionally one named half weekday.
// Calendar dates are evaluated in UTC, never in the browser's local timezone.
export function leaveSchedule(
  start: string,
  end: string,
  halfDay: boolean,
  partial: string,
) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs > endMs ||
    start.slice(0, 4) !== end.slice(0, 4)
  ) {
    return {
      days: 0,
      error: "Select an ordered date range within one calendar year.",
    };
  }
  let weekdays = 0;
  for (let day = startMs; day <= endMs; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) weekdays++;
  }
  if (!weekdays)
    return {
      days: 0,
      error: "The request must include a scheduled Monday–Friday workday.",
    };
  if (halfDay) {
    const partialMs = Date.parse(partial);
    const weekday = new Date(partialMs).getUTCDay();
    if (
      !Number.isFinite(partialMs) ||
      partialMs < startMs ||
      partialMs > endMs ||
      weekday === 0 ||
      weekday === 6
    ) {
      return {
        days: 0,
        error: "Select a half-day weekday inside the request range.",
      };
    }
  }
  return { days: weekdays - (halfDay ? 0.5 : 0), error: null };
}
