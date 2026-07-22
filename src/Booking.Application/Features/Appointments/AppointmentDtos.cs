using Booking.Application.Common.Models;
using Booking.Domain.Enums;

namespace Booking.Application.Features.Appointments;

/// <summary>Pamja e pacientit — PA InternalNote. Datat në orën e Prishtinës.</summary>
public sealed record AppointmentDto
{
    public required Guid Id { get; init; }
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required string BranchName { get; init; }
    public required string BranchAddress { get; init; }
    public required Guid DoctorId { get; init; }
    public required string DoctorName { get; init; }
    public required Guid MedicalServiceId { get; init; }
    public required string ServiceName { get; init; }
    public Guid? DependentId { get; init; }
    public string? DependentName { get; init; }
    public required DateTime StartDateTime { get; init; }
    public required DateTime EndDateTime { get; init; }
    public required AppointmentStatus Status { get; init; }
    public string? PatientNote { get; init; }
    public string? CancellationReason { get; init; }
    public DateTime? CancelledAt { get; init; }
    public required DateTime CreatedAt { get; init; }
}

/// <summary>Pamja e doktorit/klinikës — me InternalNote dhe kontaktin e pacientit.</summary>
public sealed record DoctorAppointmentDto
{
    public required Guid Id { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required string BranchName { get; init; }
    public required Guid MedicalServiceId { get; init; }
    public required string ServiceName { get; init; }
    public required string PatientName { get; init; }
    public string? PatientPhoneNumber { get; init; }
    public Guid? DependentId { get; init; }
    public string? DependentName { get; init; }
    public required DateTime StartDateTime { get; init; }
    public required DateTime EndDateTime { get; init; }
    public required AppointmentStatus Status { get; init; }
    public string? PatientNote { get; init; }
    public string? InternalNote { get; init; }
    public string? CancellationReason { get; init; }
}

public sealed record CreateAppointmentRequest
{
    public required Guid DoctorId { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required Guid MedicalServiceId { get; init; }

    /// <summary>Null = termini për vetë pacientin; ndryshe ID e dependentit të tij.</summary>
    public Guid? DependentId { get; init; }

    /// <summary>Fillimi i terminit në orën e Prishtinës — duhet të përputhet me një slot nga available-slots.</summary>
    public required DateTime StartDateTime { get; init; }

    public string? PatientNote { get; init; }
}

public sealed record CancelAppointmentRequest
{
    public string? Reason { get; init; }
}

public sealed record RescheduleAppointmentRequest
{
    /// <summary>Fillimi i ri në orën e Prishtinës — i njëjti doktor/degë/shërbim.</summary>
    public required DateTime NewStartDateTime { get; init; }
}

public sealed record MyAppointmentsQuery : PagedRequest
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public AppointmentStatus? Status { get; init; }
}

public sealed record DoctorAppointmentsQuery : PagedRequest
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public AppointmentStatus? Status { get; init; }
}

public sealed record UpdateInternalNoteRequest
{
    public required string InternalNote { get; init; }
}
