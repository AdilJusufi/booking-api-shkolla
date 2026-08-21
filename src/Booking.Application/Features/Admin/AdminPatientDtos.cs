using Booking.Application.Common.Models;
using Booking.Domain.Enums;

namespace Booking.Application.Features.Admin;

/// <summary>
/// Kërkim pacientësh nga recepsioni, për të rezervuar në emër të tyre.
///
/// Fusha <see cref="Query"/> ka minimum 3 karaktere dhe përcakton vetë shtrirjen
/// e kërkimit (shih <c>AdminPatientService</c>):
///  • email ose telefon i plotë  → kërkim global, por me detaje të reduktuara
///                                 për pacientët që s'kanë lidhje me klinikën;
///  • pjesë emri                 → vetëm pacientët e klinikave që i menaxhon useri.
/// </summary>
public sealed record AdminPatientSearchQuery : PagedRequest
{
    public required string Query { get; init; }
}

/// <summary>
/// Një pacient i gjetur. KURRË nuk përmban <c>PatientProfile.PersonalNumber</c> —
/// numri personal është i ndjeshëm dhe nuk del në listë as në kërkim.
/// </summary>
public sealed record AdminPatientSearchResultDto
{
    /// <summary>Identifikuesi që pret <c>POST api/admin/appointments</c>.</summary>
    public required Guid PatientProfileId { get; init; }

    public required string FirstName { get; init; }
    public required string LastName { get; init; }

    /// <summary>Null kur pacienti s'ka lidhje me klinikën dhe kërkimi u bë me telefon.</summary>
    public string? Email { get; init; }

    /// <summary>Null kur pacienti s'ka lidhje me klinikën dhe kërkimi u bë me email.</summary>
    public string? PhoneNumber { get; init; }

    /// <summary>Null për pacientët pa lidhje me klinikën — nuk zbulohet PII shtesë.</summary>
    public DateOnly? DateOfBirth { get; init; }

    /// <summary>
    /// True kur pacienti ka të paktën një termin në një klinikë që e menaxhon
    /// useri i kyçur. Kur është false, rreshti vjen i reduktuar dhe pa dependentë.
    /// </summary>
    public required bool HasRelationshipWithClinic { get; init; }

    /// <summary>
    /// Llogaria u krijua nga administrata dhe pacienti s'e ka marrë ende në dorëzim
    /// (s'ka vendosur password). E dobishme për recepsionin dhe për pastrimin e dublikatave.
    /// </summary>
    public required bool IsUnclaimedAccount { get; init; }

    /// <summary>Bosh për pacientët pa lidhje me klinikën.</summary>
    public required IReadOnlyList<AdminPatientDependentDto> Dependents { get; init; }
}

public sealed record AdminPatientDependentDto
{
    public required Guid Id { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public required DependentRelationship Relationship { get; init; }
}

/// <summary>
/// Krijimi i një pacienti nga recepsioni, për dikë që s'ka përdorur kurrë platformën.
/// Email-i është opsional me qëllim: rezervimi vjen me telefon dhe shumë thirrës
/// nuk kanë email.
/// </summary>
public sealed record AdminCreatePatientRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }

    /// <summary>I detyrueshëm — për një rezervim me telefon ky është kontakti kryesor.</summary>
    public required string PhoneNumber { get; init; }

    /// <summary>
    /// Opsional. Kur jepet, pacienti mund ta marrë llogarinë në dorëzim vetë përmes
    /// "kam harruar fjalëkalimin"; pa email kjo bëhet vetëm nga administrata.
    /// </summary>
    public string? Email { get; init; }

    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }

    public string? Address { get; init; }
    public string? City { get; init; }
}

/// <summary>Pacienti i krijuar — <c>PatientProfileId</c> shkon direkt te krijimi i terminit.</summary>
public sealed record AdminPatientDto
{
    public required Guid PatientProfileId { get; init; }
    public required Guid UserId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? Email { get; init; }
    public required string PhoneNumber { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }

    /// <summary>Gjithmonë true në krijim — llogaria nuk ka password derisa ta marrë pacienti.</summary>
    public required bool IsUnclaimedAccount { get; init; }
}
