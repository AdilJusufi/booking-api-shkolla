using Booking.Domain.Exceptions;

namespace Booking.Domain.ValueObjects;

/// <summary>Interval datë-orë në UTC. I pandryshueshëm.</summary>
public readonly record struct DateTimeRange
{
    public DateTime Start { get; }
    public DateTime End { get; }

    public DateTimeRange(DateTime start, DateTime end)
    {
        if (end <= start)
            throw new DomainException("DATE_RANGE_INVALID", "Mbarimi duhet të jetë pas fillimit.");
        Start = start;
        End = end;
    }

    public TimeSpan Duration => End - Start;

    /// <summary>Mbivendosje gjysmë e hapur [Start, End) — dy intervale ngjitur (10:00–10:30, 10:30–11:00) NUK mbivendosen.</summary>
    public bool Overlaps(DateTimeRange other) => Start < other.End && other.Start < End;
}
