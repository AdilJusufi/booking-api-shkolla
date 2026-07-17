namespace Booking.Infrastructure.Auth;

/// <summary>Konfigurimi i JWT — Secret vjen VETËM nga env vars ose user secrets, kurrë nga source code.</summary>
public sealed class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = null!;
    public string Audience { get; set; } = null!;
    public string Secret { get; set; } = null!;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
}

public sealed class AuthSettings
{
    public const string SectionName = "Auth";

    /// <summary>True në production — login lejohet vetëm me email të konfirmuar.</summary>
    public bool RequireConfirmedEmail { get; set; }
}
