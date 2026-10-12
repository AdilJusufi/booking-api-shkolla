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

/// <summary>Fushat e përbashkëta të krijimit dhe ndryshimit — një validator i vetëm për të dyja.</summary>
public interface IWorkingScheduleRequest
{
    Guid ClinicBranchId { get; }
    DayOfWeek DayOfWeek { get; }
    TimeOnly StartTime { get; }
    TimeOnly EndTime { get; }
    int SlotDurationMinutes { get; }
    DateOnly? ValidFrom { get; }
    DateOnly? ValidUntil { get; }
}

public sealed record CreateWorkingScheduleRequest : IWorkingScheduleRequest
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

/// <summary>PUT — zëvendëson plotësisht orarin (të njëjtat fusha dhe rregulla si krijimi).</summary>
public sealed record UpdateWorkingScheduleRequest : IWorkingScheduleRequest
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

/// <summary>Termin i rezervuar që do të mbetej jashtë orarit pas një ndryshimi — kthehet te 409.</summary>
public sealed record ScheduleAffectedAppointmentDto
{
    public required Guid Id { get; init; }

    /// <summary>Ora lokale e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public required DateTime EndDateTime { get; init; }
    public required string PatientName { get; init; }
    public required string ServiceName { get; init; }
}

public sealed record UnavailabilityDto
{
    public required Guid Id { get; init; }
    public required Guid DoctorId { get; init; }

    /// <summary>Null = vlen për të gjitha degët.</summary>
    public Guid? ClinicBranchId { get; init; }

    /// <summary>
    /// Emri i degës, i denormalizuar si te WorkingScheduleDto. Null kur bllokimi
    /// vlen për të gjitha degët (ClinicBranchId == null).
    /// </summary>
    public string? BranchName { get; init; }

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
