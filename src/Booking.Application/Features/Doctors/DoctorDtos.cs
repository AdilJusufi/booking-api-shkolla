using Booking.Application.Common.Models;

namespace Booking.Application.Features.Doctors;

public sealed record DoctorDto
{
    public required Guid Id { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required int YearsOfExperience { get; init; }
    public required IReadOnlyList<string> Specialties { get; init; }
}

public sealed record DoctorDetailsDto
{
    public required Guid Id { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? Biography { get; init; }
    public required int YearsOfExperience { get; init; }
    public required IReadOnlyList<string> Specialties { get; init; }
    public required IReadOnlyList<DoctorBranchDto> Branches { get; init; }
    public required IReadOnlyList<DoctorServiceDto> Services { get; init; }
}

public sealed record DoctorBranchDto
{
    public required Guid BranchId { get; init; }
    public required string BranchName { get; init; }
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }
    public required string City { get; init; }
    public required string Address { get; init; }
}

/// <summary>Shërbimi me kohëzgjatje/çmim EFEKTIV — override i doktorit ose vlera bazë e shërbimit.</summary>
public sealed record DoctorServiceDto
{
    public required Guid MedicalServiceId { get; init; }
    public required string Name { get; init; }
    public required Guid SpecialtyId { get; init; }
    public required string SpecialtyName { get; init; }
    public required int DurationMinutes { get; init; }
    public required decimal Price { get; init; }
    public required string Currency { get; init; }
}

public sealed record DoctorSearchRequest : PagedRequest
{
    /// <summary>Kërkim në emër e mbiemër.</summary>
    public string? SearchTerm { get; init; }

    public Guid? ClinicId { get; init; }
    public Guid? BranchId { get; init; }
    public Guid? SpecialtyId { get; init; }
    public Guid? ServiceId { get; init; }

    /// <summary>Vetëm doktorët që kanë orar pune të vlefshëm në këtë datë (nuk garanton slot të lirë).</summary>
    public DateOnly? AvailableOn { get; init; }
}
