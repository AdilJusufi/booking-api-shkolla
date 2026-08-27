namespace Booking.Application.Features.Clinics;

/// <summary>Të dhënat e një aplikimi të ri klinike — pa asgjë që s'i duhet rishikuesit.</summary>
public sealed record ClinicRegistrationNotificationContext
{
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }
    public string? ClinicPhoneNumber { get; init; }
    public string? ClinicEmail { get; init; }
    public string? Website { get; init; }

    /// <summary>Mbajtësi i llogarisë që e paraqiti klinikën — bëhet ClinicAdmin i saj.</summary>
    public required string AdminFullName { get; init; }

    public required string AdminEmail { get; init; }
    public string? AdminPhoneNumber { get; init; }

    /// <summary>Qytetet e degëve të paraqitura — konteksti i parë që i duhet rishikuesit.</summary>
    public required IReadOnlyList<string> BranchCities { get; init; }

    public required DateTime SubmittedAtUtc { get; init; }

    /// <summary>
    /// Sa klinika të tjera e mbajnë tashmë të njëjtin emër. Emri NUK bllokohet
    /// (klinika me të njëjtin emër ekzistojnë realisht në qytete të ndryshme) —
    /// numri shkon te njoftimi si sinjal që rishikuesi ta shohë me vëmendje.
    /// </summary>
    public required int ClinicsWithSameName { get; init; }
}

public sealed record ClinicApprovedNotificationContext
{
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }

    /// <summary>Administratorët e klinikës — bosh nëse s'i është caktuar ende asnjë.</summary>
    public required IReadOnlyList<string> AdminEmails { get; init; }
}

/// <summary>
/// Njoftimet e ciklit të jetës së klinikës (paraqitje → aprovim). Si te njoftimet e
/// termineve, V1 dërgon përmes IEmailService — që sot vetëm logon. Kur të lidhet një
/// provider real, kjo rrugë punon pa ndryshim tjetër.
/// Dështimi i një njoftimi NUK e prish veprimin që e shkaktoi.
/// </summary>
public interface IClinicNotificationService
{
    /// <summary>Njofton ÇDO SuperAdmin aktiv se një klinikë e re pret rishikim.</summary>
    Task ClinicRegisteredAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default);

    /// <summary>Konfirmon te mbajtësi i ri i llogarisë se aplikimi u pranua dhe është në rishikim.</summary>
    Task ClinicRegistrationReceivedAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default);

    /// <summary>Njofton administratorët e klinikës se ajo u aprovua dhe është publike.</summary>
    Task ClinicApprovedAsync(
        ClinicApprovedNotificationContext context, CancellationToken cancellationToken = default);
}
