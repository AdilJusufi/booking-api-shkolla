namespace Booking.Application.Features.Schedules;

public sealed record WorkingScheduleDto
{
    public required Guid Id { get; init; }
    public required Guid DoctorId { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required string BranchName { get; init; }
    public required DayOfWeek DayOfWeek { get; init; }
    public required TimeOnly StartTime { get; init; }
    public required TimeOnly EndTime { get; init; }
    public required int SlotDurationMinutes { get; init; }
    public required bool IsActive { get; init; }
    public DateOnly? ValidFrom { get; init; }
    public DateOnly? ValidUntil { get; init; }
}

public sealed record CreateWorkingScheduleRequest
{
    public required Guid ClinicBranchId { get; init; }
    public required DayOfWeek DayOfWeek { get; init; }

    /// <summary>Ora lokale e Prishtinës, format "HH:mm".</summary>
    public required TimeOnly StartTime { get; init; }

    public required TimeOnly EndTime { get; init; }
    public required int SlotDurationMinutes { get; init; }
    public DateOnly? ValidFrom { get; init; }
    public DateOnly? ValidUntil { get; init; }
}

public sealed record UnavailabilityDto
{
    public required Guid Id { get; init; }
    public required Guid DoctorId { get; init; }

    /// <summary>Null = vlen për të gjitha degët.</summary>
    public Guid? ClinicBranchId { get; init; }

    /// <summary>Ora lokale e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public required DateTime EndDateTime { get; init; }
    public string? Reason { get; init; }
}

public sealed record CreateUnavailabilityRequest
{
    /// <summary>Null = bllokim për të gjitha degët (p.sh. pushim vjetor).</summary>
    public Guid? ClinicBranchId { get; init; }

    /// <summary>Ora lokale e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public required DateTime EndDateTime { get; init; }
    public string? Reason { get; init; }
}
