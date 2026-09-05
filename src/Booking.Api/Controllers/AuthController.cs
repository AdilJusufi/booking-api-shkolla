using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Booking.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ICurrentUserService _currentUser;

    public AuthController(IAuthService authService, ICurrentUserService currentUser)
    {
        _authService = authService;
        _currentUser = currentUser;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<AuthResponse>> Register(
        RegisterRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _authService.RegisterPatientAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    /// <summary>
    /// Regjistrim vetëshërbyes i një klinike. Endpoint më vete dhe jo një diskriminator
    /// te <c>register</c>: trupi i kërkesës nuk mbivendoset thuajse fare me atë të pacientit
    /// (degë të ndërfutura nga njëra anë, datëlindje/gjini nga tjetra), kështu që një DTO
    /// i vetëm do ta shpërndante validimin nëpër kushte <c>When(...)</c> dhe do të bënte
    /// të domosdoshëm nullimin e fushave që janë të detyrueshme për njërën rrugë.
    /// </summary>
    [HttpPost("register-clinic")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(RegisterClinicResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<RegisterClinicResponse>> RegisterClinic(
        RegisterClinicRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _authService.RegisterClinicAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuthResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken) =>
        Ok(await _authService.LoginAsync(request, cancellationToken));

    [HttpPost("refresh-token")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuthResponse>> RefreshToken(
        RefreshTokenRequest request,
        CancellationToken cancellationToken) =>
        Ok(await _authService.RefreshAsync(request, cancellationToken));

    [HttpPost("revoke-token")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RevokeToken(
        RevokeTokenRequest request,
        CancellationToken cancellationToken)
    {
        await _authService.RevokeAsync(request, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// "email-send" jo "auth": ky endpoint dërgon email drejt një adrese arbitrare pa
    /// autentikim, kështu që i nevojitet kufizim IP më i rreptë se login/register (shih
    /// Program.cs). Vetë kufizimi për-adresë/global jeton te IEmailAbuseGuard brenda
    /// AuthService — ky policy është vetëm shtresa e parë, kundër enumerimit të shpejtë.
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("email-send")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ForgotPassword(
        ForgotPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await _authService.ForgotPasswordAsync(request, cancellationToken);
        return NoContent();
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResetPassword(
        ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await _authService.ResetPasswordAsync(request, cancellationToken);
        return NoContent();
    }

    [HttpPost("change-password")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUser.UserId ?? throw new AuthenticationFailedException();
        await _authService.ChangePasswordAsync(userId, request, cancellationToken);
        return NoContent();
    }

    [HttpPost("confirm-email")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ConfirmEmail(
        ConfirmEmailRequest request,
        CancellationToken cancellationToken)
    {
        await _authService.ConfirmEmailAsync(request, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Shih koment mbi ForgotPassword: e njëjta arsye për "email-send" në vend të "auth".
    /// </summary>
    [HttpPost("resend-confirmation")]
    [AllowAnonymous]
    [EnableRateLimiting("email-send")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResendConfirmation(
        ResendConfirmationRequest request,
        CancellationToken cancellationToken)
    {
        await _authService.ResendConfirmationEmailAsync(request, cancellationToken);
        return NoContent();
    }
}