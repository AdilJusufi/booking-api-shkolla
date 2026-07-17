using Booking.Domain.Exceptions;

namespace Booking.Domain.ValueObjects;

/// <summary>Interval kohor brenda një dite (p.sh. 08:00–12:00). I pandryshueshëm.</summary>
public readonly record struct TimeRange
{
    public TimeOnly Start { get; }
    public TimeOnly End { get; }

    public TimeRange(TimeOnly start, TimeOnly end)
    {
        if (end <= start)
            throw new DomainException("TIME_RANGE_INVALID", "Ora e mbarimit duhet të jetë pas orës së fillimit.");
        Start = start;
        End = end;
    }

    public bool Overlaps(TimeRange other) => Start < other.End && other.Start < End;

    public bool Contains(TimeRange other) => Start <= other.Start && other.End <= End;
}
