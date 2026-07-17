namespace Booking.Application.Features.Auth;

/// <summary>
/// Rastet e përdorimit të autentifikimit. Implementohet në Infrastructure
/// sepse varet nga ASP.NET Core Identity dhe JWT.
/// </summary>
public interface IAuthService
{
    /// <summary>Regjistron pacient të ri + PatientProfile, dërgon email konfirmimi dhe e kyç direkt.</summary>
    Task<AuthResponse> RegisterPatientAsync(RegisterRequest request, CancellationToken cancellationToken = default);

    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);

    /// <summary>Refresh token rotation: token-i i vjetër revokohet, lëshohet çift i ri (access + refresh).</summary>
    Task<AuthResponse> RefreshAsync(RefreshTokenRequest request, CancellationToken cancellationToken = default);

    Task RevokeAsync(RevokeTokenRequest request, CancellationToken cancellationToken = default);

    /// <summary>Kthen gjithmonë sukses (nuk zbulon nëse email-i ekziston); token-i dërgohet me email.</summary>
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken = default);

    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default);

    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken cancellationToken = default);

    Task ConfirmEmailAsync(ConfirmEmailRequest request, CancellationToken cancellationToken = default);
}
