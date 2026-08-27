using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Clinics;
using Booking.Infrastructure.Notifications.Templates;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Notifications;

/// <summary>
/// V1: njoftimet e klinikave shkojnë përmes IEmailService, që sot vetëm logon.
/// Përmbajtja dhe marrësit janë realë — mjafton të regjistrohet një IEmailService
/// me SMTP/SendGrid dhe email-at nisen pa asnjë ndryshim këtu.
///
/// Ndryshe nga tokenat e AuthService (konfirmim, rivendosje password-i), asnjë nga
/// këto tre email-e s'mbart një token — janë njoftime "për dijeni", jo hapa të
/// domosdoshëm. Prandaj kur Frontend:BaseUrl mungon, BuildLink kthen null dhe
/// shabllonet e EmailTemplates thjesht heqin butonin/linkun, pa e ndalur dërgimin:
/// marrësi ende e kupton mesazhin, thjesht pa një shkurtore klikimi.
/// </summary>
public class LoggingClinicNotificationService : IClinicNotificationService
{
    private readonly BookingDbContext _dbContext;
    private readonly IEmailService _emailService;
    private readonly FrontendSettings _frontendSettings;
    private readonly ILogger<LoggingClinicNotificationService> _logger;

    public LoggingClinicNotificationService(
        BookingDbContext dbContext,
        IEmailService emailService,
        IOptions<FrontendSettings> frontendSettings,
        ILogger<LoggingClinicNotificationService> logger)
    {
        _dbContext = dbContext;
        _emailService = emailService;
        _frontendSettings = frontendSettings.Value;
        _logger = logger;
    }

    public async Task ClinicRegisteredAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default)
    {
        var recipients = await GetSuperAdminEmailsAsync(cancellationToken);
        if (recipients.Count == 0)
        {
            // Pa marrës njoftimi humbet në heshtje — dhe bashkë me të edhe rishikimi.
            _logger.LogWarning(
                "Klinika {ClinicId} pret aprovim por s'u gjet asnjë SuperAdmin aktiv për ta njoftuar.",
                context.ClinicId);
            return;
        }

        var reviewLink = BuildLink(_frontendSettings.SuperAdminClinicsPath);
        var email = EmailTemplates.NewClinicAwaitingReview(
            context.ClinicName,
            context.ClinicId,
            context.ClinicPhoneNumber,
            context.ClinicEmail,
            context.Website,
            context.BranchCities,
            context.AdminFullName,
            context.AdminEmail,
            context.AdminPhoneNumber,
            context.SubmittedAtUtc,
            context.ClinicsWithSameName,
            reviewLink);

        _logger.LogInformation(
            "Njoftim regjistrimi klinike {ClinicId} për {RecipientCount} SuperAdmin",
            context.ClinicId, recipients.Count);

        foreach (var recipient in recipients)
        {
            await _emailService.SendAsync(recipient, email.Subject, email.Html, email.Text, cancellationToken);
        }
    }

    public async Task ClinicRegistrationReceivedAsync(
        ClinicRegistrationNotificationContext context, CancellationToken cancellationToken = default)
    {
        var myClinicsLink = BuildLink(_frontendSettings.MyClinicsPath);
        var email = EmailTemplates.ClinicPendingReview(context.AdminFullName, context.ClinicName, myClinicsLink);

        _logger.LogInformation("Konfirmim paraqitjeje për klinikën {ClinicId}", context.ClinicId);

        await _emailService.SendAsync(context.AdminEmail, email.Subject, email.Html, email.Text, cancellationToken);
    }

    public async Task ClinicApprovedAsync(
        ClinicApprovedNotificationContext context, CancellationToken cancellationToken = default)
    {
        if (context.AdminEmails.Count == 0)
        {
            return;
        }

        var myClinicsLink = BuildLink(_frontendSettings.MyClinicsPath);
        var email = EmailTemplates.ClinicApproved(context.ClinicName, myClinicsLink);

        _logger.LogInformation("Njoftim aprovimi për klinikën {ClinicId}", context.ClinicId);

        foreach (var recipient in context.AdminEmails)
        {
            await _emailService.SendAsync(recipient, email.Subject, email.Html, email.Text, cancellationToken);
        }
    }

    /// <summary>
    /// Filtrimi bëhet në DB përmes tabelave të Identity — njësoj si te
    /// SuperAdminService.GetUsersAsync, pa ngarkuar userat në memorie.
    /// </summary>
    private async Task<IReadOnlyList<string>> GetSuperAdminEmailsAsync(CancellationToken cancellationToken) =>
        await _dbContext.Users
            .Where(u => u.IsActive
                        && u.Email != null
                        && _dbContext.UserRoles.Any(ur =>
                            ur.UserId == u.Id
                            && _dbContext.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.SuperAdmin)))
            .Select(u => u.Email!)
            .ToListAsync(cancellationToken);

    private string? BuildLink(string path)
    {
        var baseUrl = _frontendSettings.BaseUrl?.TrimEnd('/');
        return string.IsNullOrWhiteSpace(baseUrl) ? null : baseUrl + path;
    }
}
