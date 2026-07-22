using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Application.Features.Auth;
using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Auth;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly BookingDbContext _dbContext;
    private readonly JwtTokenService _jwtTokenService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ICurrentUserService _currentUser;
    private readonly IEmailService _emailService;
    private readonly AuthSettings _authSettings;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        BookingDbContext dbContext,
        JwtTokenService jwtTokenService,
        IDateTimeProvider dateTimeProvider,
        ICurrentUserService currentUser,
        IEmailService emailService,
        IOptions<AuthSettings> authSettings,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _dateTimeProvider = dateTimeProvider;
        _currentUser = currentUser;
        _emailService = emailService;
        _authSettings = authSettings.Value;
        _logger = logger;
    }

    public async Task<AuthResponse> RegisterPatientAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await _userManager.FindByEmailAsync(request.Email);
        if (existing is not null)
        {
            throw new ConflictException("email-exists", "Ekziston tashmë një llogari me këtë email.");
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            PhoneNumber = request.PhoneNumber,
            FirstName = request.FirstName,
            LastName = request.LastName,
            CreatedAt = _dateTimeProvider.UtcNow
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        ThrowIfFailed(createResult);

        await _userManager.AddToRoleAsync(user, Roles.Patient);

        _dbContext.PatientProfiles.Add(new PatientProfile
        {
            UserId = user.Id,
            DateOfBirth = request.DateOfBirth,
            Gender = request.Gender,
            Address = request.Address,
            City = request.City
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var confirmationToken = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        await _emailService.SendAsync(
            user.Email!,
            "Konfirmo llogarinë tënde",
            $"Tokeni i konfirmimit: {confirmationToken}",
            cancellationToken);

        _logger.LogInformation("Pacient i ri u regjistrua: {UserId}", user.Id);

        return await IssueTokensAsync(user, cancellationToken);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            throw new AuthenticationFailedException();
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            throw new AuthenticationFailedException("Llogaria është bllokuar përkohësisht nga tentimet e dështuara. Provo më vonë.");
        }

        if (!await _userManager.CheckPasswordAsync(user, request.Password))
        {
            await _userManager.AccessFailedAsync(user);
            throw new AuthenticationFailedException();
        }

        if (_authSettings.RequireConfirmedEmail && !user.EmailConfirmed)
        {
            throw new AuthenticationFailedException("Email-i nuk është konfirmuar ende. Kontrollo postën tënde.");
        }

        await _userManager.ResetAccessFailedCountAsync(user);

        return await IssueTokensAsync(user, cancellationToken);
    }

    public async Task<AuthResponse> RefreshAsync(RefreshTokenRequest request, CancellationToken cancellationToken = default)
    {
        var now = _dateTimeProvider.UtcNow;
        var tokenHash = TokenHasher.Sha256(request.RefreshToken);

        var storedToken = await _dbContext.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null)
        {
            throw new AuthenticationFailedException("Refresh token i pavlefshëm.");
        }

        if (!storedToken.IsActive(now))
        {
            // Përdorim i një tokeni tashmë të rotuar = shenjë vjedhjeje →
            // revokohen TË GJITHA sesionet aktive të userit.
            if (storedToken.RevokedAt is not null)
            {
                _logger.LogWarning("Tentim ripërdorimi i refresh token-it të revokuar për user {UserId} — të gjitha sesionet u revokuan", storedToken.UserId);
                await RevokeAllActiveTokensAsync(storedToken.UserId, now, cancellationToken);
            }

            throw new AuthenticationFailedException("Refresh token i pavlefshëm.");
        }

        var user = await _userManager.FindByIdAsync(storedToken.UserId.ToString());
        if (user is null || !user.IsActive)
        {
            throw new AuthenticationFailedException();
        }

        // Rotation: revoko të vjetrin, lësho të riun, lidhi zinxhir.
        var (response, newToken) = await IssueTokensCoreAsync(user, saveChanges: false, cancellationToken);

        storedToken.RevokedAt = now;
        storedToken.ReplacedByTokenId = newToken.Id;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return response;
    }

    public async Task RevokeAsync(RevokeTokenRequest request, CancellationToken cancellationToken = default)
    {
        var tokenHash = TokenHasher.Sha256(request.RefreshToken);
        var storedToken = await _dbContext.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null)
        {
            throw new NotFoundException("RefreshToken", "***");
        }

        if (_currentUser.UserId != storedToken.UserId && !_currentUser.IsInRole(Roles.SuperAdmin))
        {
            throw new ForbiddenAccessException();
        }

        if (storedToken.RevokedAt is null)
        {
            storedToken.RevokedAt = _dateTimeProvider.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            // Mos zbulo nëse email-i ekziston — përgjigje identike në të dy rastet.
            return;
        }

        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        await _emailService.SendAsync(
            user.Email!,
            "Rivendos password-in",
            $"Tokeni për rivendosje: {resetToken}",
            cancellationToken);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            throw new AuthenticationFailedException("Tokeni i rivendosjes është i pavlefshëm.");
        }

        var result = await _userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
        {
            throw new AuthenticationFailedException("Tokeni i rivendosjes është i pavlefshëm.");
        }

        // Pas ndryshimit të password-it të gjitha sesionet ekzistuese bëhen të pavlefshme.
        await RevokeAllActiveTokensAsync(user.Id, _dateTimeProvider.UtcNow, cancellationToken);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new NotFoundException("User", userId);

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        ThrowIfFailed(result);

        await RevokeAllActiveTokensAsync(user.Id, _dateTimeProvider.UtcNow, cancellationToken);
    }

    public async Task ConfirmEmailAsync(ConfirmEmailRequest request, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            throw new AuthenticationFailedException("Tokeni i konfirmimit është i pavlefshëm.");
        }

        var result = await _userManager.ConfirmEmailAsync(user, request.Token);
        if (!result.Succeeded)
        {
            throw new AuthenticationFailedException("Tokeni i konfirmimit është i pavlefshëm.");
        }
    }

    private async Task<AuthResponse> IssueTokensAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var (response, _) = await IssueTokensCoreAsync(user, saveChanges: true, cancellationToken);
        return response;
    }

    private async Task<(AuthResponse Response, RefreshToken Token)> IssueTokensCoreAsync(
        ApplicationUser user, bool saveChanges, CancellationToken cancellationToken)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, accessExpiresAt) = _jwtTokenService.CreateAccessToken(user, roles);
        var (rawRefreshToken, refreshTokenHash, refreshExpiresAt) = _jwtTokenService.CreateRefreshToken();

        var newToken = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refreshTokenHash,
            ExpiresAt = refreshExpiresAt,
            CreatedAt = _dateTimeProvider.UtcNow,
            DeviceInfo = _currentUser.DeviceInfo,
            IpAddress = _currentUser.IpAddress
        };
        _dbContext.RefreshTokens.Add(newToken);

        if (saveChanges)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var response = new AuthResponse
        {
            UserId = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email!,
            Roles = roles.ToList(),
            AccessToken = accessToken,
            AccessTokenExpiresAt = accessExpiresAt,
            RefreshToken = rawRefreshToken,
            RefreshTokenExpiresAt = refreshExpiresAt
        };

        return (response, newToken);
    }

    private async Task RevokeAllActiveTokensAsync(Guid userId, DateTime utcNow, CancellationToken cancellationToken)
    {
        await _dbContext.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null && t.ExpiresAt > utcNow)
            .ExecuteUpdateAsync(setters => setters.SetProperty(t => t.RevokedAt, utcNow), cancellationToken);
    }

    /// <summary>Gabimet e Identity (password policy etj.) → ValidationException → HTTP 422.</summary>
    private static void ThrowIfFailed(IdentityResult result)
    {
        if (result.Succeeded)
        {
            return;
        }

        var failures = result.Errors
            .Select(e => new ValidationFailure(e.Code, e.Description))
            .ToList();
        throw new ValidationException(failures);
    }
}
