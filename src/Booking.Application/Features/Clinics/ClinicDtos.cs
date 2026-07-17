using Booking.Application.Common.Models;

namespace Booking.Application.Features.Clinics;

public sealed record ClinicDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
    public required IReadOnlyList<string> Cities { get; init; }
}

public sealed record ClinicDetailsDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
    public required IReadOnlyList<ClinicBranchDto> Branches { get; init; }
    public required IReadOnlyList<MedicalServiceDto> Services { get; init; }
}

public sealed record ClinicBranchDto
{
    public required Guid Id { get; init; }
    public required Guid ClinicId { get; init; }
    public required string Name { get; init; }
    public required string Address { get; init; }
    public required string City { get; init; }
    public string? Municipality { get; init; }
    public decimal? Latitude { get; init; }
    public decimal? Longitude { get; init; }
    public string? PhoneNumber { get; init; }
}

public sealed record MedicalServiceDto
{
    public required Guid Id { get; init; }
    public required Guid ClinicId { get; init; }
    public required Guid SpecialtyId { get; init; }
    public required string SpecialtyName { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required int DurationMinutes { get; init; }
    public required decimal Price { get; init; }
    public required string Currency { get; init; }
}

/// <summary>Filtrat e kërkimit të klinikave — të gjithë opsionalë.</summary>
public sealed record ClinicSearchRequest : PagedRequest
{
    public string? City { get; init; }
    public string? Municipality { get; init; }
    public Guid? SpecialtyId { get; init; }
    public Guid? ServiceId { get; init; }
    public string? SearchTerm { get; init; }

    /// <summary>True = vetëm klinikat ku momentin aktual ka doktor me orar pune aktiv.</summary>
    public bool? IsOpen { get; init; }

    /// <summary>"name" (default) ose "name_desc".</summary>
    public string? SortBy { get; init; }
}

public sealed record SpecialtyDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
}
