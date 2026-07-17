using Booking.Domain.Common;
using Booking.Domain.ValueObjects;

namespace Booking.Domain.Entities;

/// <summary>
/// Orari javor i doktorit në një degë. Një ditë mund të ketë disa rreshta
/// (p.sh. 08:00–12:00 dhe 13:00–17:00). Oret janë ora lokale (Europe/Belgrade).
/// </summary>
public class DoctorWorkingSchedule : AuditableEntity
{
    public Guid DoctorId { get; set; }
    public Guid ClinicBranchId { get; set; }
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>Rrjeti bazë i sloteve (p.sh. çdo 15 min fillon slot i ri); kohëzgjatja e terminit vjen nga shërbimi.</summary>
    public int SlotDurationMinutes { get; set; }

    public bool IsActive { get; set; } = true;
    public DateOnly? ValidFrom { get; set; }
    public DateOnly? ValidUntil { get; set; }

    public Doctor Doctor { get; set; } = null!;
    public ClinicBranch ClinicBranch { get; set; } = null!;

    public TimeRange ToTimeRange() => new(StartTime, EndTime);

    public bool IsValidOn(DateOnly date) =>
        IsActive
        && date.DayOfWeek == DayOfWeek
        && (ValidFrom is null || date >= ValidFrom)
        && (ValidUntil is null || date <= ValidUntil);
}
