using Booking.Domain.Entities;
using Booking.Domain.ValueObjects;

namespace Booking.Domain.Services;

/// <summary>
/// Gjenerimi i sloteve të lira — logjikë e pastër, pa databazë, plotësisht e testueshme.
/// Slotet NUK ruhen në databazë; llogariten sa herë kërkohen nga orari + rezervimet + bllokimet.
/// </summary>
public static class SlotGenerator
{
    /// <param name="schedules">Oraret e doktorit të vlefshme për datën (të para-filtruara me IsValidOn + degë).</param>
    /// <param name="date">Data lokale (Europe/Belgrade) për të cilën kërkohen slotet.</param>
    /// <param name="durationMinutes">Kohëzgjatja efektive e shërbimit (override i doktorit ose vlera bazë).</param>
    /// <param name="toUtc">Konvertimi kohë lokale → UTC (injektohet që Domain të mos varet nga TimeZoneInfo).</param>
    /// <param name="utcNow">Momenti aktual në UTC — slotet e kaluara përjashtohen.</param>
    /// <param name="busyPeriodsUtc">Periudha të zëna në UTC: rezervime aktive + bllokime të doktorit.</param>
    /// <returns>Slotet e lira si intervale UTC, të renditura.</returns>
    public static IReadOnlyList<DateTimeRange> Generate(
        IEnumerable<DoctorWorkingSchedule> schedules,
        DateOnly date,
        int durationMinutes,
        Func<DateTime, DateTime> toUtc,
        DateTime utcNow,
        IReadOnlyCollection<DateTimeRange> busyPeriodsUtc)
    {
        if (durationMinutes <= 0)
        {
            return [];
        }

        var duration = TimeSpan.FromMinutes(durationMinutes);
        var slots = new SortedDictionary<DateTime, DateTimeRange>();

        foreach (var schedule in schedules)
        {
            var step = TimeSpan.FromMinutes(schedule.SlotDurationMinutes);
            if (step <= TimeSpan.Zero)
            {
                continue;
            }

            // Aritmetikë me TimeSpan (jo TimeOnly.Add) — TimeOnly bën wrap në mesnatë dhe do të krijonte lak të pafund.
            var windowStart = schedule.StartTime.ToTimeSpan();
            var windowEnd = schedule.EndTime.ToTimeSpan();

            for (var slotStart = windowStart; slotStart + duration <= windowEnd; slotStart += step)
            {
                var localStart = date.ToDateTime(TimeOnly.FromTimeSpan(slotStart));
                var startUtc = toUtc(localStart);
                var slot = new DateTimeRange(startUtc, startUtc + duration);

                if (slot.Start <= utcNow)
                {
                    continue; // slotet e kaluara ose që fillojnë pikërisht tani nuk rezervohen
                }

                if (busyPeriodsUtc.Any(busy => busy.Overlaps(slot)))
                {
                    continue;
                }

                slots.TryAdd(slot.Start, slot);
            }
        }

        return slots.Values.ToList();
    }
}
