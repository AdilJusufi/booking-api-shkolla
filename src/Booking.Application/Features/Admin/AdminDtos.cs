using Booking.Application.Common.Models;
using Booking.Domain.Enums;

namespace Booking.Application.Features.Admin;

// ---------- Klinika ----------

public sealed record CreateClinicRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
}

public sealed record UpdateClinicRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
}

/// <summary>Pamja administrative — përfshin edhe IsApproved/IsActive që publiku s'i sheh.</summary>
public sealed record AdminClinicDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
    public required bool IsApproved { get; init; }
    public required bool IsActive { get; init; }
    public required DateTime CreatedAt { get; init; }
}

public sealed record CreateBranchRequest
{
    public required string Name { get; init; }
    public required string Address { get; init; }
    public required string City { get; init; }
    public string? Municipality { get; init; }
    public decimal? Latitude { get; init; }
    public decimal? Longitude { get; init; }
    public string? PhoneNumber { get; init; }
}

public sealed record CreateMedicalServiceRequest
{
    public required Guid SpecialtyId { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required int DurationMinutes { get; init; }
    public required decimal Price { get; init; }
    public string Currency { get; init; } = "EUR";
}

// ---------- Doktori ----------

public sealed record CreateDoctorRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public required string PhoneNumber { get; init; }

    /// <summary>Password fillestar — doktori duhet ta ndryshojë pas kyçjes së parë.</summary>
    public required string InitialPassword { get; init; }

    public required string LicenseNumber { get; init; }
    public string? Biography { get; init; }
    public required int YearsOfExperience { get; init; }
    public required IReadOnlyList<Guid> SpecialtyIds { get; init; }

    /// <summary>Degët e klinikës ku do të punojë — duhet t'i përkasin klinikës së URL-së.</summary>
    public required IReadOnlyList<Guid> BranchIds { get; init; }

    /// <summary>Shërbimet e klinikës që i ofron (opsionale në krijim).</summary>
    public IReadOnlyList<Guid> ServiceIds { get; init; } = [];
}

public sealed record AdminDoctorDto
{
    public required Guid Id { get; init; }
    public required Guid UserId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public required string LicenseNumber { get; init; }
    public required bool IsVerified { get; init; }
    public required bool IsActive { get; init; }
}

// ---------- SuperAdmin ----------

public sealed record AssignClinicAdminRequest
{
    /// <summary>Email i një useri ekzistues — i jepet roli ClinicAdmin dhe qasja në klinikë.</summary>
    public required string Email { get; init; }
}

public sealed record CreateSpecialtyRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
}

public sealed record UpdateSpecialtyRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required bool IsActive { get; init; }
}

public sealed record AuditLogDto
{
    public required Guid Id { get; init; }
    public Guid? UserId { get; init; }
    public required string Action { get; init; }
    public required string EntityName { get; init; }
    public string? EntityId { get; init; }
    public string? OldValues { get; init; }
    public string? NewValues { get; init; }
    public string? IpAddress { get; init; }
    public required DateTime CreatedAt { get; init; }
}

public sealed record AuditLogQuery : PagedRequest
{
    public string? EntityName { get; init; }
    public Guid? UserId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

// ---------- Terminet (admin) ----------

public sealed record AdminCreateAppointmentRequest
{
    /// <summary>Email i pacientit ekzistues në sistem.</summary>
    public required string PatientEmail { get; init; }

    public required Guid DoctorId { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required Guid MedicalServiceId { get; init; }
    public Guid? DependentId { get; init; }

    /// <summary>Ora e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public string? PatientNote { get; init; }
    public string? InternalNote { get; init; }
}

public sealed record AdminUpdateAppointmentRequest
{
    public string? InternalNote { get; init; }

    /// <summary>Kalim statusi opsional (Confirmed, CheckedIn, InProgress, Completed, NoShow) — validohet me BookingPolicy.</summary>
    public AppointmentStatus? Status { get; init; }
}

public sealed record AdminCancelAppointmentRequest
{
    public string? Reason { get; init; }
}

public sealed record AdminRescheduleAppointmentRequest
{
    /// <summary>Ora e Prishtinës.</summary>
    public required DateTime NewStartDateTime { get; init; }
}

// ---------- Raporti ----------

public sealed record ClinicReportDto
{
    public required DateOnly From { get; init; }
    public required DateOnly To { get; init; }
    public required int TotalAppointments { get; init; }
    public required IReadOnlyDictionary<string, int> ByStatus { get; init; }
    public required IReadOnlyList<DoctorAppointmentCountDto> ByDoctor { get; init; }
}

public sealed record DoctorAppointmentCountDto
{
    public required Guid DoctorId { get; init; }
    public required string DoctorName { get; init; }
    public required int AppointmentCount { get; init; }
}
