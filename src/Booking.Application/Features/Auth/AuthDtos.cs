using Booking.Domain.Enums;

namespace Booking.Application.Features.Auth;

public sealed record RegisterRequest(
    string FirstName,
    string LastName,
    string Email,
    string PhoneNumber,
    string Password,
    DateOnly DateOfBirth,
    Gender Gender,
    string? Address,
    string? City);

/// <summary>
/// Vetë-regjistrimi i një klinike: mbajtësi i llogarisë bëhet ClinicAdmin, klinika
/// krijohet e paaprovuar dhe pret rishikimin e SuperAdmin-it. Fushat janë të emërtuara
/// (jo pozicionale si te <see cref="RegisterRequest"/>) sepse kërkesa mbart tri grupe
/// të dhënash — mbajtësin, klinikën dhe degët.
/// </summary>
public sealed record RegisterClinicRequest
{
    // ---------- Mbajtësi i llogarisë (bëhet ClinicAdmin) ----------

    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public required string PhoneNumber { get; init; }
    public required string Password { get; init; }

    // ---------- Klinika ----------

    public required string ClinicName { get; init; }
    public string? Description { get; init; }
    public required string ClinicPhoneNumber { get; init; }

    /// <summary>Email-i publik i klinikës — mund të jetë tjetër nga ai i mbajtësit të llogarisë.</summary>
    public string? ClinicEmail { get; init; }

    public string? Website { get; init; }

    /// <summary>Së paku një degë — pa lokacion klinika s'do të dilte kurrë në kërkim.</summary>
    public required IReadOnlyList<RegisterClinicBranchRequest> Branches { get; init; }
}

public sealed record RegisterClinicBranchRequest
{
    public required string Name { get; init; }
    public required string Address { get; init; }
    public required string City { get; init; }
    public string? Municipality { get; init; }
    public string? PhoneNumber { get; init; }
}

/// <summary>
/// Klinika e sapoparaqitur plus token-at e mbajtësit — ai kyçet menjëherë dhe e sheh
/// klinikën në gjendje "në pritje", ndonëse ende s'mund ta menaxhojë.
/// </summary>
public sealed record RegisterClinicResponse
{
    public required AuthResponse Auth { get; init; }
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }

    /// <summary>Gjithmonë false në regjistrim — e vendos SuperAdmin-i me aprovim.</summary>
    public required bool IsApproved { get; init; }
}

public sealed record LoginRequest(string Email, string Password);

public sealed record RefreshTokenRequest(string RefreshToken);

public sealed record RevokeTokenRequest(string RefreshToken);

public sealed record ForgotPasswordRequest(string Email);

public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record ConfirmEmailRequest(string Email, string Token);

public sealed record ResendConfirmationRequest(string Email);

public sealed record AuthResponse
{
    public required Guid UserId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public required IReadOnlyList<string> Roles { get; init; }
    public required string AccessToken { get; init; }
    public required DateTime AccessTokenExpiresAt { get; init; }
    public required string RefreshToken { get; init; }
    public required DateTime RefreshTokenExpiresAt { get; init; }
}
